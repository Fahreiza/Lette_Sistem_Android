import { getDatabase } from '../database/db';
import { shiftService } from './shiftService';
import {
  SalesReportSummary,
  TopSellingItem,
  OrderChannel,
} from '../types';
import { formatOnlyDate } from '../utils/formatters';

export const reportService = {
  async getSalesReport(startDate?: string, endDate?: string): Promise<SalesReportSummary> {
    const db = await getDatabase();
    let whereTrx = "WHERE status != 'void'";
    let whereExp = 'WHERE 1=1';
    const paramsTrx: any[] = [];
    const paramsExp: any[] = [];

    if (startDate) {
      whereTrx += ' AND date(tanggal) >= date(?)';
      whereExp += ' AND date(tanggal) >= date(?)';
      paramsTrx.push(startDate);
      paramsExp.push(startDate);
    }
    if (endDate) {
      whereTrx += ' AND date(tanggal) <= date(?)';
      whereExp += ' AND date(tanggal) <= date(?)';
      paramsTrx.push(endDate);
      paramsExp.push(endDate);
    }

    // 1. Transaction Metrics
    const trxAgg = await db.getFirstAsync<{
      totalOmset: number;
      totalKomisiOnline: number;
      totalVoucherOnline: number;
      omsetOnlineNet: number;
      totalTransaksi: number;
      omsetOffline: number;
      omsetGoFood: number;
      omsetShopeeFood: number;
      omsetGrabFood: number;
      totalTunai: number;
      totalQris: number;
    }>(
      `SELECT
        COALESCE(SUM(total), 0) as totalOmset,
        COALESCE(SUM(online_commission_amount), 0) as totalKomisiOnline,
        COALESCE(SUM(online_voucher_discount), 0) as totalVoucherOnline,
        COALESCE(SUM(CASE WHEN channel != 'offline' THEN COALESCE(online_net_amount, total - online_voucher_discount - online_commission_amount) ELSE 0 END), 0) as omsetOnlineNet,
        COUNT(id) as totalTransaksi,
        COALESCE(SUM(CASE WHEN channel = 'offline' THEN total ELSE 0 END), 0) as omsetOffline,
        COALESCE(SUM(CASE WHEN channel = 'gofood' THEN total ELSE 0 END), 0) as omsetGoFood,
        COALESCE(SUM(CASE WHEN channel = 'shopeefood' THEN total ELSE 0 END), 0) as omsetShopeeFood,
        COALESCE(SUM(CASE WHEN channel = 'grabfood' THEN total ELSE 0 END), 0) as omsetGrabFood,
        COALESCE(SUM(CASE WHEN (channel = 'offline' AND LOWER(metode_bayar) IN ('tunai', 'cash')) THEN total ELSE 0 END), 0) as totalTunai,
        COALESCE(SUM(CASE WHEN (channel = 'offline' AND LOWER(metode_bayar) = 'qris') THEN total ELSE 0 END), 0) as totalQris
      FROM transactions
      ${whereTrx};`,
      paramsTrx
    );

    // 2. Expense Metric
    const expAgg = await db.getFirstAsync<{ totalPengeluaran: number; totalBelanjaStok: number }>(
      `SELECT
        COALESCE(SUM(jumlah), 0) as totalPengeluaran,
        COALESCE(SUM(CASE WHEN LOWER(kategori) IN ('belanja stok', 'belanja bahan baku', 'bahan baku', 'kulakan') THEN jumlah ELSE 0 END), 0) as totalBelanjaStok
       FROM expenses ${whereExp};`,
      paramsExp
    );

    const totalOmset = trxAgg?.totalOmset || 0;
    const totalKomisiOnline = trxAgg?.totalKomisiOnline || 0;
    const totalVoucherOnline = trxAgg?.totalVoucherOnline || 0;
    const omsetOnlineNet = trxAgg?.omsetOnlineNet || 0;
    const totalOmsetNet = Math.max(0, totalOmset - totalKomisiOnline - totalVoucherOnline);
    const totalPengeluaran = expAgg?.totalPengeluaran || 0;
    const totalBelanjaStok = expAgg?.totalBelanjaStok || 0;
    const biayaOperasional = Math.max(0, totalPengeluaran - totalBelanjaStok);

    // 3. Recipe HPP (Cost of Goods Sold / Food Cost)
    let whereJoinTrx = "WHERE t.status != 'void'";
    if (startDate) whereJoinTrx += ' AND date(t.tanggal) >= date(?)';
    if (endDate) whereJoinTrx += ' AND date(t.tanggal) <= date(?)';

    let totalHpp = 0;
    try {
      const hppRow = await db.getFirstAsync<{ totalHpp: number }>(
        `SELECT COALESCE(SUM(ti.qty * r.jumlah_terpakai * COALESCE(i.harga_beli_satuan, 0)), 0) as totalHpp
         FROM transaction_items ti
         JOIN transactions t ON ti.transaction_id = t.id
         JOIN recipes r ON ti.menu_item_id = r.menu_item_id
         JOIN ingredients i ON r.ingredient_id = i.id
         ${whereJoinTrx};`,
        paramsTrx
      );
      totalHpp = Math.round(hppRow?.totalHpp || 0);

      // Hitung tambahan HPP dari varian / topping yang digunakan dalam transaksi
      const variantItems = await db.getAllAsync<{ variant_ids: string; qty: number }>(
        `SELECT ti.variant_ids, ti.qty
         FROM transaction_items ti
         JOIN transactions t ON ti.transaction_id = t.id
         ${whereJoinTrx}
         AND ti.variant_ids IS NOT NULL AND ti.variant_ids != '' AND ti.variant_ids != '[]';`,
        paramsTrx
      );

      if (variantItems && variantItems.length > 0) {
        const mvRows = await db.getAllAsync<{ id: number; nama_varian: string; ingredient_id: number; jumlah_terpakai: number; ingredients_list: string }>(
          'SELECT id, nama_varian, ingredient_id, jumlah_terpakai, ingredients_list FROM master_variants;'
        );
        const ingRows = await db.getAllAsync<{ id: number; harga_beli_satuan: number }>(
          'SELECT id, harga_beli_satuan FROM ingredients;'
        );
        const ingCostMap = new Map<number, number>();
        ingRows.forEach(i => ingCostMap.set(i.id, i.harga_beli_satuan || 0));

        let variantTotalHpp = 0;
        for (const item of variantItems) {
          let varIds: any[] = [];
          const raw = String(item.variant_ids).trim();
          if (raw.startsWith('[')) {
            try { varIds = JSON.parse(raw); } catch {}
          } else {
            varIds = raw.split(',').map(s => s.trim());
          }

          for (const vRef of varIds) {
            const num = Number(vRef);
            let matchedMv = !isNaN(num) && num > 0
              ? mvRows.find(m => m.id === num)
              : undefined;
            if (!matchedMv && typeof vRef === 'string') {
              const clean = vRef.replace(/\s*\(\+[^)]+\)/g, '').trim().toLowerCase();
              matchedMv = mvRows.find(m => m.nama_varian.trim().toLowerCase() === clean);
            }
            if (matchedMv) {
              let entries: Array<{ ingredient_id: number; jumlah_terpakai: number }> = [];
              if (matchedMv.ingredients_list) {
                try {
                  const parsed = typeof matchedMv.ingredients_list === 'string' ? JSON.parse(matchedMv.ingredients_list) : matchedMv.ingredients_list;
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    entries = parsed.filter((e: any) => e.ingredient_id && Number(e.jumlah_terpakai) > 0);
                  }
                } catch {}
              }
              if (entries.length === 0 && matchedMv.ingredient_id && matchedMv.jumlah_terpakai > 0) {
                entries = [{ ingredient_id: matchedMv.ingredient_id, jumlah_terpakai: matchedMv.jumlah_terpakai }];
              }

              for (const entry of entries) {
                const cost = ingCostMap.get(entry.ingredient_id) || 0;
                variantTotalHpp += (Number(entry.jumlah_terpakai) * cost) * (item.qty || 1);
              }
            }
          }
        }
        totalHpp += Math.round(variantTotalHpp);
      }
    } catch {
      totalHpp = 0;
    }

    const labaKotor = totalOmsetNet - totalHpp;
    const estimasiLabaBersih = totalHpp > 0 ? (labaKotor - biayaOperasional) : (totalOmsetNet - totalPengeluaran);
    const foodCostPercentage = totalOmsetNet > 0 ? (totalHpp / totalOmsetNet) * 100 : 0;

    // 4. Shift Opening Capital (Modal Awal)
    let whereShift = 'WHERE 1=1';
    const paramsShift: any[] = [];
    if (startDate) {
      whereShift += ' AND date(waktu_buka) >= date(?)';
      paramsShift.push(startDate);
    }
    if (endDate) {
      whereShift += ' AND date(waktu_buka) <= date(?)';
      paramsShift.push(endDate);
    }

    let totalModalAwal = 0;
    try {
      const shiftAgg = await db.getFirstAsync<{ totalModal: number }>(
        `SELECT COALESCE(SUM(modal_awal), 0) as totalModal FROM shifts ${whereShift};`,
        paramsShift
      );
      totalModalAwal = shiftAgg?.totalModal || 0;
    } catch {
      totalModalAwal = 0;
    }

    const arusKasBersih = totalOmsetNet - totalPengeluaran;

    return {
      totalOmset,
      totalOmsetNet,
      totalKomisiOnline,
      totalVoucherOnline,
      omsetOnlineNet,
      totalTransaksi: trxAgg?.totalTransaksi || 0,
      omsetOffline: trxAgg?.omsetOffline || 0,
      omsetGoFood: trxAgg?.omsetGoFood || 0,
      omsetShopeeFood: trxAgg?.omsetShopeeFood || 0,
      omsetGrabFood: trxAgg?.omsetGrabFood || 0,
      totalTunai: trxAgg?.totalTunai || 0,
      totalQris: trxAgg?.totalQris || 0,
      totalPengeluaran,
      estimasiLabaBersih,
      totalModalAwal,
      arusKasBersih,
      totalHpp,
      labaKotor,
      foodCostPercentage,
    };
  },

  async getTopSellingMenus(
    startDate?: string,
    endDate?: string,
    channel?: OrderChannel | 'all',
    limit = 10
  ): Promise<TopSellingItem[]> {
    const db = await getDatabase();
    let query = `
      SELECT
        ti.menu_item_id,
        COALESCE(m.nama, ti.menu_name, 'Menu Dihapus') as menu_name,
        COALESCE(c.nama, 'Lainnya') as category_name,
        SUM(ti.qty) as total_qty,
        SUM(ti.subtotal) as total_sales
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      LEFT JOIN menu_items m ON ti.menu_item_id = m.id
      LEFT JOIN menu_categories c ON m.category_id = c.id
      WHERE t.status != 'void'
    `;
    const params: any[] = [];

    if (startDate) {
      query += ' AND date(t.tanggal) >= date(?)';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND date(t.tanggal) <= date(?)';
      params.push(endDate);
    }
    if (channel && channel !== 'all') {
      query += ' AND t.channel = ?';
      params.push(channel);
    }

    query += ' GROUP BY ti.menu_item_id ORDER BY total_qty DESC, total_sales DESC LIMIT ?;';
    params.push(limit);

    return await db.getAllAsync<TopSellingItem>(query, params);
  },

  async getDailyTrend(days = 7): Promise<{ date: string; label: string; omset: number }[]> {
    const db = await getDatabase();
    const result: { date: string; label: string; omset: number }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = formatOnlyDate(d);
      const dayName = d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric' });

      const row = await db.getFirstAsync<{ omset: number }>(
        "SELECT COALESCE(SUM(total), 0) as omset FROM transactions WHERE status != 'void' AND date(tanggal) = date(?);",
        [dateStr]
      );

      result.push({
        date: dateStr,
        label: dayName,
        omset: row?.omset || 0,
      });
    }

    return result;
  },

  async getCurrentBalances(): Promise<{
    saldoLaciKasir: number;
    saldoManager: number;
    saldoRekeningOwner: number;
    totalPenjualanLaci: number;
    totalPenjualanOwner: number;
    totalPengeluaranLaci: number;
    totalPengeluaranManager: number;
    totalPengeluaranOwner: number;
  }> {
    const db = await getDatabase();

    // 1. Initial settings balances
    const settings = await db.getFirstAsync<{
      saldo_awal_laci?: number;
      saldo_awal_manager?: number;
      saldo_awal_rekening?: number;
    }>('SELECT saldo_awal_laci, saldo_awal_manager, saldo_awal_rekening FROM app_settings WHERE id = 1 LIMIT 1;');

    const baseLaci = settings?.saldo_awal_laci || 0;
    const baseManager = settings?.saldo_awal_manager || 0;
    const baseOwner = settings?.saldo_awal_rekening || 0;

    // 2. Sales into Laci (offline tunai)
    const inLaciRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(total), 0) as total FROM transactions
       WHERE status != 'void'
       AND (
         (channel = 'offline' AND (metode_bayar = 'tunai' OR metode_bayar = 'cash'))
         AND (sumber_dana = 'laci_kasir' OR sumber_dana IS NULL)
       );`
    );

    // 3. Sales into Rekening Owner (QRIS / online net)
    const inOwnerRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(
        CASE 
          WHEN channel != 'offline' THEN COALESCE(online_net_amount, total - online_commission_amount)
          ELSE total
        END
      ), 0) as total FROM transactions
       WHERE status != 'void'
       AND (
         sumber_dana = 'rekening_owner'
         OR channel != 'offline'
         OR (metode_bayar != 'tunai' AND metode_bayar != 'cash')
       );`
    );

    // 4. Expenses breakdown per wallet
    const outLaciRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(jumlah), 0) as total FROM expenses
       WHERE sumber_dana = 'laci_kasir' OR sumber_dana IS NULL;`
    );

    const outManagerRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(jumlah), 0) as total FROM expenses
       WHERE sumber_dana = 'saldo_manager';`
    );

    const outOwnerRow = await db.getFirstAsync<{ total: number }>(
      `SELECT COALESCE(SUM(jumlah), 0) as total FROM expenses
       WHERE sumber_dana = 'rekening_owner';`
    );

    const totalPenjualanLaci = inLaciRow?.total || 0;
    const totalPenjualanOwner = inOwnerRow?.total || 0;
    const totalPengeluaranLaci = outLaciRow?.total || 0;
    const totalPengeluaranManager = outManagerRow?.total || 0;
    const totalPengeluaranOwner = outOwnerRow?.total || 0;

    // 5. Transfer Deltas
    let transferLaciDelta = 0;
    let transferManagerDelta = 0;
    let transferOwnerDelta = 0;

    try {
      const transferRows = await db.getAllAsync<{ from_wallet: string; to_wallet: string; total: number }>(
        `SELECT from_wallet, to_wallet, COALESCE(SUM(jumlah), 0) as total 
         FROM wallet_transfers 
         GROUP BY from_wallet, to_wallet;`
      );

      for (const tr of transferRows) {
        if (tr.from_wallet === 'laci_kasir') transferLaciDelta -= tr.total;
        if (tr.from_wallet === 'saldo_manager') transferManagerDelta -= tr.total;
        if (tr.from_wallet === 'rekening_owner') transferOwnerDelta -= tr.total;

        if (tr.to_wallet === 'laci_kasir') transferLaciDelta += tr.total;
        if (tr.to_wallet === 'saldo_manager') transferManagerDelta += tr.total;
        if (tr.to_wallet === 'rekening_owner') transferOwnerDelta += tr.total;
      }
    } catch {
      // Table may not have records yet
    }

    // 6. Adjustment Deltas
    let adjLaciDelta = 0;
    let adjManagerDelta = 0;
    let adjOwnerDelta = 0;
    let hasAdjLaci = false;
    let hasAdjManager = false;
    let hasAdjOwner = false;

    try {
      const adjRows = await db.getAllAsync<{ dompet: string; total: number; count: number }>(
        `SELECT dompet, COALESCE(SUM(selisih), 0) as total, COUNT(*) as count 
         FROM balance_adjustments 
         GROUP BY dompet;`
      );

      for (const adj of adjRows) {
        if (adj.dompet === 'laci_kasir') {
          adjLaciDelta += adj.total;
          if (adj.count > 0) hasAdjLaci = true;
        }
        if (adj.dompet === 'saldo_manager') {
          adjManagerDelta += adj.total;
          if (adj.count > 0) hasAdjManager = true;
        }
        if (adj.dompet === 'rekening_owner') {
          adjOwnerDelta += adj.total;
          if (adj.count > 0) hasAdjOwner = true;
        }
      }
    } catch {
      // Table may not have records yet
    }

    // Hindari double-counting: Jika dompet sudah memiliki riwayat koreksi saldo (balance_adjustments),
    // basis saldo awal dari settings diabaikan (0) persis seperti logika Desktop POS (sqlite-engine.ts).
    const effectiveBaseLaci = hasAdjLaci ? 0 : baseLaci;
    const effectiveBaseManager = hasAdjManager ? 0 : baseManager;
    const effectiveBaseOwner = hasAdjOwner ? 0 : baseOwner;

    // 7. Calculate Saldo Laci Kasir
    let saldoLaciKasir = 0;
    try {
      const activeShift = await shiftService.getActiveShift();
      if (activeShift) {
        const summary = await shiftService.getShiftSummary(activeShift.id);
        saldoLaciKasir = summary.totalExpectedCash;
      } else {
        const lastClosed = await shiftService.getLastClosedShift();
        if (lastClosed && typeof lastClosed.uang_fisik_aktual === 'number') {
          // Hitung transaksi dan pengeluaran setelah closing
          const postCloseSales = await db.getFirstAsync<{ total: number }>(
            `SELECT COALESCE(SUM(total), 0) as total FROM transactions 
             WHERE status != 'void' AND LOWER(metode_bayar) IN ('tunai', 'cash')
             AND datetime(tanggal) > datetime(?);`,
            [lastClosed.waktu_tutup || lastClosed.waktu_buka]
          );
          const postCloseExp = await db.getFirstAsync<{ total: number }>(
            `SELECT COALESCE(SUM(jumlah), 0) as total FROM expenses 
             WHERE (sumber_dana = 'laci_kasir' OR sumber_dana IS NULL)
             AND datetime(tanggal) > datetime(?);`,
            [lastClosed.waktu_tutup || lastClosed.waktu_buka]
          );
          let postCloseTransferDelta = 0;
          try {
            const postCloseTransfers = await db.getAllAsync<{ from_wallet: string; to_wallet: string; total: number }>(
              `SELECT from_wallet, to_wallet, COALESCE(SUM(jumlah), 0) as total FROM wallet_transfers 
               WHERE datetime(tanggal) > datetime(?)
               GROUP BY from_wallet, to_wallet;`,
              [lastClosed.waktu_tutup || lastClosed.waktu_buka]
            );
            for (const tr of postCloseTransfers) {
              if (tr.to_wallet === 'laci_kasir') postCloseTransferDelta += tr.total;
              if (tr.from_wallet === 'laci_kasir') postCloseTransferDelta -= tr.total;
            }
          } catch {}

          let postCloseAdjDelta = 0;
          try {
            const postCloseAdj = await db.getFirstAsync<{ total: number }>(
              `SELECT COALESCE(SUM(selisih), 0) as total FROM balance_adjustments 
               WHERE dompet = 'laci_kasir' AND datetime(tanggal) > datetime(?);`,
              [lastClosed.waktu_tutup || lastClosed.waktu_buka]
            );
            postCloseAdjDelta = postCloseAdj?.total || 0;
          } catch {}

          saldoLaciKasir = Math.max(
            0,
            lastClosed.uang_fisik_aktual + (postCloseSales?.total || 0) - (postCloseExp?.total || 0) + postCloseTransferDelta + postCloseAdjDelta
          );
        } else {
          saldoLaciKasir = Math.max(0, effectiveBaseLaci + totalPenjualanLaci - totalPengeluaranLaci + transferLaciDelta + adjLaciDelta);
        }
      }
    } catch {
      saldoLaciKasir = Math.max(0, effectiveBaseLaci + totalPenjualanLaci - totalPengeluaranLaci + transferLaciDelta + adjLaciDelta);
    }

    const saldoManager = Math.max(0, effectiveBaseManager + transferManagerDelta - totalPengeluaranManager + adjManagerDelta);
    const saldoRekeningOwner = Math.max(0, effectiveBaseOwner + totalPenjualanOwner - totalPengeluaranOwner + transferOwnerDelta + adjOwnerDelta);

    return {
      saldoLaciKasir,
      saldoManager,
      saldoRekeningOwner,
      totalPenjualanLaci,
      totalPenjualanOwner,
      totalPengeluaranLaci,
      totalPengeluaranManager,
      totalPengeluaranOwner,
    };
  },

  async getBestSellerStats(
    period: 'today' | '7days' | 'thisMonth' | 'all' = 'thisMonth',
    channel: 'all' | 'offline' | 'gofood' | 'shopeefood' | 'grabfood' = 'all'
  ): Promise<{
    items: {
      id: string;
      nama: string;
      kategori: string;
      qty: number;
      omset: number;
      percent: number;
    }[];
    totalQty: number;
    totalOmset: number;
  }> {
    const db = await getDatabase();
    const now = new Date();
    const todayStr = formatOnlyDate(now);

    let startDate = '';
    if (period === 'today') {
      startDate = todayStr;
    } else if (period === '7days') {
      const d = new Date(now.getTime() - 7 * 86400000);
      startDate = formatOnlyDate(d);
    } else if (period === 'thisMonth') {
      const d = new Date(now.getFullYear(), now.getMonth(), 1);
      startDate = formatOnlyDate(d);
    }

    let query = `
      SELECT
        ti.menu_item_id as id,
        COALESCE(m.nama, ti.menu_name, 'Menu Dihapus') as nama,
        COALESCE(c.nama, 'Lainnya') as kategori,
        SUM(ti.qty) as qty,
        SUM(ti.subtotal) as omset
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      LEFT JOIN menu_items m ON ti.menu_item_id = m.id
      LEFT JOIN menu_categories c ON m.category_id = c.id
      WHERE t.status != 'void'
    `;
    const params: any[] = [];

    if (startDate) {
      query += ' AND date(t.tanggal) >= date(?)';
      params.push(startDate);
    }
    if (channel && channel !== 'all') {
      query += ' AND t.channel = ?';
      params.push(channel);
    }

    query += ' GROUP BY ti.menu_item_id ORDER BY qty DESC, omset DESC;';

    const rows = await db.getAllAsync<{
      id: string | number;
      nama: string;
      kategori: string;
      qty: number;
      omset: number;
    }>(query, params);

    const totalQty = rows.reduce((s, r) => s + (r.qty || 0), 0);
    const totalOmset = rows.reduce((s, r) => s + (r.omset || 0), 0);

    const items = rows.map((r) => ({
      id: String(r.id),
      nama: r.nama,
      kategori: r.kategori,
      qty: r.qty,
      omset: r.omset,
      percent: totalQty > 0 ? Math.round((r.qty / totalQty) * 100) : 0,
    }));

    return { items, totalQty, totalOmset };
  },

  async getDashboardSummary(): Promise<{
    omsetHariIni: number;
    transaksiHariIni: number;
    omsetKemarin: number;
    pengeluaranBulanIni: number;
    labaBersihBulanIni: number;
    lowStockCount: number;
    topMenus: TopSellingItem[];
    saldoLaciKasir: number;
    saldoManager: number;
    saldoRekeningOwner: number;
  }> {
    const db = await getDatabase();
    const today = formatOnlyDate(new Date());

    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = formatOnlyDate(yesterdayDate);

    const now = new Date();
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    // Today
    const todayRes = await db.getFirstAsync<{ omset: number; count: number }>(
      "SELECT COALESCE(SUM(total), 0) as omset, COUNT(id) as count FROM transactions WHERE status != 'void' AND date(tanggal) = date(?);",
      [today]
    );

    // Yesterday
    const yesterdayRes = await db.getFirstAsync<{ omset: number }>(
      "SELECT COALESCE(SUM(total), 0) as omset FROM transactions WHERE status != 'void' AND date(tanggal) = date(?);",
      [yesterday]
    );

    // Month
    const monthTrx = await db.getFirstAsync<{ omset: number }>(
      "SELECT COALESCE(SUM(total), 0) as omset FROM transactions WHERE status != 'void' AND date(tanggal) >= date(?);",
      [startOfMonth]
    );
    const monthExp = await db.getFirstAsync<{ exp: number }>(
      'SELECT COALESCE(SUM(jumlah), 0) as exp FROM expenses WHERE date(tanggal) >= date(?);',
      [startOfMonth]
    );

    // Low stock count
    const lowStock = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM ingredients WHERE stok_saat_ini <= stok_minimum;'
    );

    // Top menus today
    const topMenus = await this.getTopSellingMenus(today, today, 'all', 5);

    // Balances
    const balances = await this.getCurrentBalances();

    const omsetBulan = monthTrx?.omset || 0;
    const expBulan = monthExp?.exp || 0;

    return {
      omsetHariIni: todayRes?.omset || 0,
      transaksiHariIni: todayRes?.count || 0,
      omsetKemarin: yesterdayRes?.omset || 0,
      pengeluaranBulanIni: expBulan,
      labaBersihBulanIni: omsetBulan - expBulan,
      lowStockCount: lowStock?.count || 0,
      topMenus,
      saldoLaciKasir: balances.saldoLaciKasir,
      saldoManager: balances.saldoManager,
      saldoRekeningOwner: balances.saldoRekeningOwner,
    };
  },
};
