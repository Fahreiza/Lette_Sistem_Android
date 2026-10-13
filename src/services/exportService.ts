import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { Transaction, SalesReportSummary, TopSellingItem } from '../types';
import {
  formatIDR,
  formatDateIndo,
  formatTransactionNo,
  getChannelLabel,
  getPaymentMethodLabel,
} from '../utils/formatters';
import { usePrinterStore } from '../stores/printerStore';
import { bluetoothPrinterService } from './bluetoothPrinterService';
import { settingsService } from './settingsService';

export const exportService = {
  /**
   * Share receipt as formatted plain text to WhatsApp or other apps
   */
  generateReceiptText(trx: Transaction, storeName = 'Lette Roti Bakar', footer = 'Terima kasih atas kunjungan Anda!'): string {
    let text = `================================\n`;
    text += `       *${storeName.toUpperCase()}*\n`;
    text += `================================\n`;
    text += `No. Trx : ${formatTransactionNo(trx.id, trx.tanggal)}\n`;
    text += `Tgl     : ${formatDateIndo(trx.tanggal)}\n`;
    text += `Kasir   : ${trx.kasir_name || 'Kasir'}\n`;
    text += `Channel : ${getChannelLabel(trx.channel)}\n`;
    const onlineMatch = trx.catatan?.match(/\[No\.\s*Pesanan:\s*([^\]]+)\]/i);
    if (onlineMatch) {
      text += `No. Ojol: *${onlineMatch[1].trim()}*\n`;
    }
    text += `Metode  : ${getPaymentMethodLabel(trx.metode_bayar)}\n`;
    text += `--------------------------------\n`;

    for (const item of trx.items || []) {
      text += `${item.menu_name || 'Item'} x${item.qty}\n`;
      if (item.variant_ids && item.variant_ids !== '[]' && item.variant_ids.trim() !== '') {
        text += `  + ${item.variant_ids}\n`;
      }
      if (item.custom_notes) {
        text += `  * Note: ${item.custom_notes}\n`;
      }
      text += `  ${formatIDR(item.harga_satuan)} = ${formatIDR(item.subtotal)}\n`;
    }

    text += `--------------------------------\n`;
    if (trx.tax_amount && trx.tax_amount > 0) {
      const sub = trx.subtotal || (trx.total - trx.tax_amount);
      text += `Subtotal: ${formatIDR(sub)}\n`;
      text += `PPN (${trx.tax_percentage || 10}%): ${formatIDR(trx.tax_amount)}\n`;
    }
    if (trx.online_voucher_discount && trx.online_voucher_discount > 0) {
      text += `Diskon Voucher: -${formatIDR(trx.online_voucher_discount)}\n`;
    }
    text += `*TOTAL   : ${formatIDR(trx.total)}*\n`;
    if (trx.metode_bayar === 'tunai' && trx.uang_diterima !== undefined && trx.uang_diterima > 0) {
      text += `Tunai   : ${formatIDR(trx.uang_diterima)}\n`;
      text += `Kembali : ${formatIDR(trx.kembalian || 0)}\n`;
    }
    if (trx.catatan) {
      text += `Catatan : ${trx.catatan}\n`;
    }
    text += `================================\n`;
    text += `${footer}\n`;

    return text;
  },

  /**
   * Build 58mm thermal receipt HTML
   */
  buildReceiptHtml(trx: Transaction, storeName = 'Lette Roti Bakar', extraInfo?: { branch?: string; address?: string; phone?: string; footer?: string }): string {
    const onlineMatch = trx.catatan?.match(/\[No\.\s*Pesanan:\s*([^\]]+)\]/i);
    const onlineCodeHtml = onlineMatch
      ? `<div class="info-row" style="font-weight: bold; color: #b45309; background-color: #fef3c7; padding: 2px 4px; border-radius: 4px; margin-bottom: 4px;"><span>No. Pesanan:</span><span>${onlineMatch[1].trim()}</span></div>`
      : '';

    const itemsHtml = (trx.items || [])
      .map(
        (i) => `
        <tr>
          <td style="padding: 4px 0; border-bottom: 1px dotted #e2e8f0;">
            <div style="font-weight: 700; font-size: 12px;">${i.menu_name || 'Item'}</div>
            ${i.variant_ids && i.variant_ids !== '[]' && i.variant_ids.trim() !== '' ? `<div style="font-size: 10px; color: #b45309;">+ ${i.variant_ids}</div>` : ''}
            ${i.custom_notes ? `<div style="font-size: 10px; color: #0284c7; font-style: italic;">* ${i.custom_notes}</div>` : ''}
            <div style="font-size: 11px; color: #475569;">${i.qty} x ${formatIDR(i.harga_satuan)}</div>
          </td>
          <td style="text-align: right; vertical-align: top; padding: 4px 0; font-weight: 700; font-size: 12px; border-bottom: 1px dotted #e2e8f0;">
            ${formatIDR(i.subtotal)}
          </td>
        </tr>
      `
      )
      .join('');

    const taxHtml = trx.tax_amount && trx.tax_amount > 0
      ? `
        <div class="info-row" style="margin-top: 4px;"><span>Subtotal:</span><span>${formatIDR(trx.subtotal || (trx.total - trx.tax_amount))}</span></div>
        <div class="info-row"><span>PPN (${trx.tax_percentage || 10}%):</span><span>${formatIDR(trx.tax_amount)}</span></div>
      `
      : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            font-variant-numeric: tabular-nums;
            width: 290px;
            margin: 0 auto;
            padding: 10px;
            color: #0f172a;
            font-size: 12px;
            line-height: 1.35;
          }
          .header { text-align: center; margin-bottom: 8px; }
          .title { font-size: 16px; font-weight: 900; margin: 0; text-transform: uppercase; letter-spacing: 0.02em; }
          .branch { font-size: 11px; font-weight: bold; color: #334155; margin-top: 2px; }
          .subtitle { font-size: 10.5px; margin: 2px 0; color: #64748b; }
          .divider { border-top: 1px dashed #475569; margin: 8px 0; }
          .info-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 3px; }
          table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
          .total-row { font-size: 15px; font-weight: 900; display: flex; justify-content: space-between; margin-top: 8px; font-variant-numeric: tabular-nums; }
          .footer { text-align: center; margin-top: 14px; font-size: 10.5px; color: #64748b; line-height: 14px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">${storeName}</div>
          ${extraInfo?.branch ? `<div class="branch">${extraInfo.branch}</div>` : ''}
          ${extraInfo?.address ? `<div class="subtitle">${extraInfo.address}</div>` : ''}
          ${extraInfo?.phone ? `<div class="subtitle">Telp: ${extraInfo.phone}</div>` : ''}
        </div>
        <div class="divider"></div>
        <div class="info-row"><span>No. Struk:</span><span style="font-weight: bold;">${formatTransactionNo(trx.id, trx.tanggal)}</span></div>
        <div class="info-row"><span>Waktu:</span><span>${formatDateIndo(trx.tanggal)}</span></div>
        <div class="info-row"><span>Kasir:</span><span>${trx.kasir_name || 'Kasir'}</span></div>
        <div class="info-row"><span>Channel:</span><span>${getChannelLabel(trx.channel)}</span></div>
        ${onlineCodeHtml}
        <div class="info-row"><span>Metode:</span><span>${getPaymentMethodLabel(trx.metode_bayar)}</span></div>
        <div class="divider"></div>
        <table>
          ${itemsHtml}
        </table>
        <div class="divider"></div>
        ${taxHtml}
        ${trx.online_voucher_discount && trx.online_voucher_discount > 0 ? `<div class="info-row" style="color: #dc2626;"><span>Diskon Voucher:</span><span>-${formatIDR(trx.online_voucher_discount)}</span></div>` : ''}
        <div class="total-row">
          <span>TOTAL:</span>
          <span>${formatIDR(trx.total)}</span>
        </div>
        ${
          trx.metode_bayar === 'tunai' && trx.uang_diterima !== undefined && trx.uang_diterima > 0
            ? `
          <div class="info-row" style="margin-top: 6px;"><span>Tunai:</span><span>${formatIDR(trx.uang_diterima)}</span></div>
          <div class="info-row"><span>Kembali:</span><span style="font-weight: bold; color: #16a34a;">${formatIDR(trx.kembalian || 0)}</span></div>
        `
            : ''
        }
        ${trx.catatan ? `<div style="font-size: 10px; margin-top: 6px; padding: 4px; background: #f1f5f9; border-radius: 4px;">Catatan: ${trx.catatan}</div>` : ''}
        <div class="divider"></div>
        <div class="footer">
          <div>${extraInfo?.footer || 'Terima kasih atas kunjungan Anda!'}</div>
        </div>
      </body>
      </html>
    `;
  },

  /**
   * Direct Thermal Printing:
   * 1. If Bluetooth Thermal Printer is connected -> Print ESC/POS directly to hardware (NO PDF dialog).
   * 2. If not connected -> Fallback to system print dialog (PDF spooler).
   */
  async printThermalReceipt(trx: Transaction, storeName = 'Lette Roti Bakar'): Promise<void> {
    const { connected, connectedPrinter, printerTarget, paperWidth } = usePrinterStore.getState();

    if ((connected || connectedPrinter || printerTarget) && bluetoothPrinterService.isNativeModuleAvailable()) {
      try {
        await bluetoothPrinterService.printReceipt(trx, storeName, paperWidth);
        return;
      } catch (err) {
        console.warn('[ExportService] Bluetooth direct print failed, falling back to system print:', err);
      }
    }

    const html = this.buildReceiptHtml(trx, storeName);
    await Print.printAsync({ html });
  },

  /**
   * Generate Thermal-style Receipt PDF and open Share Intent
   */
  async shareReceiptPdf(trx: Transaction, storeName = 'Lette Roti Bakar'): Promise<void> {
    const html = this.buildReceiptHtml(trx, storeName);
    const { uri } = await Print.printToFileAsync({ html, width: 300 });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: `Struk Transaksi ${formatTransactionNo(trx.id, trx.tanggal)}`,
      });
    }
  },

  /**
   * Export Sales Report to PDF
   */
  async exportReportPdf(
    summary: SalesReportSummary,
    topMenus: TopSellingItem[],
    periodLabel: string
  ): Promise<void> {
    const topMenuRows = topMenus
      .map(
        (m, idx) => `
        <tr>
          <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${idx + 1}</td>
          <td style="padding: 6px; border: 1px solid #ddd;">${m.menu_name} (${m.category_name})</td>
          <td style="padding: 6px; border: 1px solid #ddd; text-align: center;">${m.total_qty}</td>
          <td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${formatIDR(m.total_sales)}</td>
        </tr>
      `
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; color: #1e293b; font-size: 13px; }
          .header { text-align: center; border-bottom: 2px solid #ea580c; padding-bottom: 12px; margin-bottom: 20px; }
          .h1 { font-size: 20px; font-weight: bold; color: #ea580c; margin: 0; }
          .h2 { font-size: 14px; color: #64748b; margin-top: 4px; }
          .grid { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px; }
          .card { flex: 1; min-width: 140px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; }
          .card-title { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: bold; }
          .card-value { font-size: 16px; font-weight: bold; color: #0f172a; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th { background: #ea580c; color: #ffffff; padding: 8px; text-align: left; font-size: 12px; }
          .profit-box { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; padding: 12px; border-radius: 8px; font-size: 15px; font-weight: bold; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="h1">LETTE ROTI BAKAR</div>
          <div class="h2">Laporan Penjualan & Keuangan (${periodLabel})</div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-title">Total Omset</div>
            <div class="card-value" style="color: #ea580c;">${formatIDR(summary.totalOmset)}</div>
          </div>
          <div class="card">
            <div class="card-title">Total Transaksi</div>
            <div class="card-value">${summary.totalTransaksi} Pesanan</div>
          </div>
          <div class="card">
            <div class="card-title">Total HPP Bahan</div>
            <div class="card-value" style="color: #2563eb;">${formatIDR(summary.totalHpp || 0)}</div>
          </div>
          <div class="card">
            <div class="card-title">Laba Kotor</div>
            <div class="card-value" style="color: #7c3aed;">${formatIDR(summary.labaKotor !== undefined ? summary.labaKotor : (summary.totalOmset - (summary.totalHpp || 0)))}</div>
          </div>
          <div class="card">
            <div class="card-title">Total Pengeluaran</div>
            <div class="card-value" style="color: #dc2626;">${formatIDR(summary.totalPengeluaran)}</div>
          </div>
        </div>

        <div class="profit-box">
          Estimasi Laba Bersih Operasional: ${formatIDR(summary.estimasiLabaBersih)} ${summary.foodCostPercentage ? `(Food Cost: ${summary.foodCostPercentage.toFixed(1)}%)` : ''}
        </div>

        <h3 style="margin-bottom: 8px;">Breakdown Omset Per Channel</h3>
        <table>
          <thead>
            <tr>
              <th>Channel Penjualan</th>
              <th style="text-align: right;">Total Omset</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style="padding: 6px; border: 1px solid #ddd;">Offline / Dine-in</td><td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${formatIDR(summary.omsetOffline)}</td></tr>
            <tr><td style="padding: 6px; border: 1px solid #ddd;">GoFood</td><td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${formatIDR(summary.omsetGoFood)}</td></tr>
            <tr><td style="padding: 6px; border: 1px solid #ddd;">ShopeeFood</td><td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${formatIDR(summary.omsetShopeeFood)}</td></tr>
            <tr><td style="padding: 6px; border: 1px solid #ddd;">GrabFood</td><td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${formatIDR(summary.omsetGrabFood)}</td></tr>
          </tbody>
        </table>

        <h3 style="margin-top: 20px; margin-bottom: 8px;">Breakdown Metode Pembayaran</h3>
        <table>
          <thead>
            <tr>
              <th>Metode Bayar</th>
              <th style="text-align: right;">Total Nilai</th>
            </tr>
          </thead>
          <tbody>
            <tr><td style="padding: 6px; border: 1px solid #ddd;">Tunai (Cash)</td><td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${formatIDR(summary.totalTunai)}</td></tr>
            <tr><td style="padding: 6px; border: 1px solid #ddd;">QRIS / Digital</td><td style="padding: 6px; border: 1px solid #ddd; text-align: right;">${formatIDR(summary.totalQris)}</td></tr>
          </tbody>
        </table>

        ${
          topMenus.length > 0
            ? `
          <h3 style="margin-top: 20px; margin-bottom: 8px;">Menu Terlaris</h3>
          <table>
            <thead>
              <tr>
                <th style="width: 40px; text-align: center;">#</th>
                <th>Nama Menu</th>
                <th style="text-align: center;">Qty Terjual</th>
                <th style="text-align: right;">Total Omset</th>
              </tr>
            </thead>
            <tbody>
              ${topMenuRows}
            </tbody>
          </table>
        `
            : ''
        }
      </body>
      </html>
    `;

    const { uri } = await Print.printToFileAsync({ html });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, {
        UTI: '.pdf',
        mimeType: 'application/pdf',
        dialogTitle: `Laporan Penjualan - ${periodLabel}`,
      });
    }
  },

  /**
   * Export Transactions and Summary to Excel (.xlsx)
   */
  async exportReportExcel(
    transactions: Transaction[],
    summary: SalesReportSummary,
    periodLabel: string
  ): Promise<void> {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Summary
    const summaryData = [
      ['LAPORAN KEUANGAN LETTE ROTI BAKAR'],
      ['Periode', periodLabel],
      [''],
      ['METRIK PENJUALAN & KEUANGAN', 'NILAI (RP)'],
      ['Total Omset', summary.totalOmset],
      ['Total Transaksi', summary.totalTransaksi],
      ['Total HPP Bahan (BOM & Varian)', summary.totalHpp || 0],
      ['Laba Kotor', summary.labaKotor !== undefined ? summary.labaKotor : (summary.totalOmset - (summary.totalHpp || 0))],
      ['Food Cost (%)', `${(summary.foodCostPercentage || 0).toFixed(1)}%`],
      ['Omset Offline', summary.omsetOffline],
      ['Omset GoFood', summary.omsetGoFood],
      ['Omset ShopeeFood', summary.omsetShopeeFood],
      ['Omset GrabFood', summary.omsetGrabFood],
      ['Total Pembayaran Tunai', summary.totalTunai],
      ['Total Pembayaran QRIS', summary.totalQris],
      ['Total Pengeluaran', summary.totalPengeluaran],
      ['Estimasi Laba Bersih', summary.estimasiLabaBersih],
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 32 }, { wch: 22 }];
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Ringkasan');

    // Sheet 2: Data Transaksi
    const trxRows = transactions.map((t) => ({
      'ID Transaksi': formatTransactionNo(t.id, t.tanggal),
      'Tanggal': t.tanggal,
      'Channel': t.channel.toUpperCase(),
      'Metode Bayar': t.metode_bayar.toUpperCase(),
      'Subtotal (Rp)': t.subtotal || (t.total - (t.tax_amount || 0)),
      'PPN (Rp)': t.tax_amount || 0,
      'Diskon Voucher (Rp)': t.online_voucher_discount || 0,
      'Total (Rp)': t.total,
      'Status': t.status.toUpperCase(),
      'Kasir': t.kasir_name || '-',
      'Catatan': t.catatan || '',
    }));
    const wsTrx = XLSX.utils.json_to_sheet(trxRows);
    wsTrx['!cols'] = [
      { wch: 24 }, // ID Transaksi
      { wch: 22 }, // Tanggal
      { wch: 16 }, // Channel
      { wch: 16 }, // Metode Bayar
      { wch: 18 }, // Subtotal (Rp)
      { wch: 14 }, // PPN (Rp)
      { wch: 20 }, // Diskon Voucher (Rp)
      { wch: 18 }, // Total (Rp)
      { wch: 14 }, // Status
      { wch: 18 }, // Kasir
      { wch: 32 }, // Catatan
    ];
    XLSX.utils.book_append_sheet(wb, wsTrx, 'Daftar Transaksi');

    const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
    const fileName = `Laporan_Lette_${Date.now()}.xlsx`;
    const filePath = `${FileSystem.documentDirectory}${fileName}`;

    await FileSystem.writeAsStringAsync(filePath, wbout, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(filePath, {
        UTI: 'com.microsoft.excel.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: `Ekspor Excel - ${periodLabel}`,
      });
    }
  },
};
