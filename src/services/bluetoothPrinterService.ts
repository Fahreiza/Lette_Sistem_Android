import { Platform, PermissionsAndroid } from 'react-native';
import { Transaction } from '../types';
import { BluetoothDevice, usePrinterStore } from '../stores/printerStore';
import { settingsService } from './settingsService';
import { formatIDR, formatDateIndo, formatTimeIndo, formatTransactionNo, getChannelLabel, getPaymentMethodLabel } from '../utils/formatters';

let BluetoothEscposPrinter: any = null;
let BluetoothManager: any = null;

if (Platform.OS === 'android') {
  try {
    const escpos = require('@vardrz/react-native-bluetooth-escpos-printer');
    BluetoothEscposPrinter = escpos?.BluetoothEscposPrinter;
    BluetoothManager = escpos?.BluetoothManager;
  } catch (err) {
    console.warn('[BluetoothPrinter] Native module not available (e.g. running in Expo Go):', err);
  }
}

export const bluetoothPrinterService = {
  /**
   * Check if Native Bluetooth module is loaded and ready
   */
  isNativeModuleAvailable(): boolean {
    return Boolean(BluetoothManager && BluetoothEscposPrinter);
  },

  /**
   * Request Bluetooth permissions on Android strictly aligned with POS-Offline-main
   * Android 12+ (API 31+) requires BLUETOOTH_SCAN and BLUETOOTH_CONNECT
   * Android < 12 requires ACCESS_FINE_LOCATION
   */
  async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      if (Platform.Version >= 31) {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        ]);
        return (
          granted['android.permission.BLUETOOTH_SCAN'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.BLUETOOTH_CONNECT'] === PermissionsAndroid.RESULTS.GRANTED
        );
      } else {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      }
    } catch (err) {
      console.warn('[BT Printer] Permission request error:', err);
      return false;
    }
  },

  /**
   * Scan for Bluetooth Thermal Printers
   * Implements the exact stable timing, loop check, and retry logic from POS-Offline-main
   */
  async scanDevices(): Promise<BluetoothDevice[]> {
    if (!BluetoothManager) {
      throw new Error(
        'Modul Bluetooth Native tidak tersedia di Expo Go. Silakan gunakan APK Standalone atau Development Build (npx expo run:android).'
      );
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      throw new Error('Aplikasi membutuhkan izin Bluetooth untuk mencari printer.');
    }

    usePrinterStore.getState().setIsScanning(true);
    usePrinterStore.getState().setAvailableDevices([]);

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

    try {
      // 1. Enable Bluetooth on Android and get already paired devices
      const pairedRaw = await BluetoothManager.enableBluetooth();

      // 2. Poll isBluetoothEnabled with delay until adapter is active
      let bluetoothOn = false;
      for (let i = 0; i < 10; i++) {
        bluetoothOn = await BluetoothManager.isBluetoothEnabled();
        if (bluetoothOn) break;
        await delay(400);
      }

      if (!bluetoothOn) {
        throw new Error('Bluetooth tidak aktif. Nyalakan Bluetooth lalu coba lagi.');
      }

      // 3. Essential settling delay for Android radio adapter before discovery
      await delay(800);

      // 4. Scan Devices with retry on NOT_STARTED error
      let result: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const raw = await BluetoothManager.scanDevices();
          result = typeof raw === 'string' ? JSON.parse(raw) : raw;
          break;
        } catch (e: any) {
          const msg = String(e?.message ?? e ?? '');
          if (msg.includes('NOT_STARTED') && attempt < 2) {
            await delay(1500);
            continue;
          }
          throw e;
        }
      }

      const seen = new Set<string>();
      const allDevices: BluetoothDevice[] = [];

      // 5. Process paired devices from enableBluetooth()
      if (Array.isArray(pairedRaw)) {
        for (const p of pairedRaw) {
          try {
            const dev: BluetoothDevice = typeof p === 'string' ? JSON.parse(p) : p;
            if (dev?.address && !seen.has(dev.address)) {
              seen.add(dev.address);
              allDevices.push({ ...dev, bonded: true });
            }
          } catch {}
        }
      }

      // 6. Process paired devices from scanDevices()
      for (const d of result?.paired ?? []) {
        if (d?.address && !seen.has(d.address)) {
          seen.add(d.address);
          allDevices.push({ ...d, bonded: true });
        }
      }

      // 7. Process discovered / found devices
      for (const d of result?.found ?? []) {
        if (d?.address && !seen.has(d.address)) {
          seen.add(d.address);
          allDevices.push({ ...d, bonded: false });
        }
      }

      usePrinterStore.getState().setAvailableDevices(allDevices);
      return allDevices;
    } finally {
      usePrinterStore.getState().setIsScanning(false);
    }
  },

  /**
   * Connect to Bluetooth Printer using MAC address
   */
  async connect(addressOrDevice: string | BluetoothDevice, name?: string): Promise<{ success: boolean; error?: string }> {
    if (!BluetoothManager) {
      return {
        success: false,
        error: 'Modul Bluetooth Native tidak tersedia di Expo Go. Gunakan APK hasil build.',
      };
    }

    const address = typeof addressOrDevice === 'string' ? addressOrDevice : addressOrDevice.address;
    const printerName = typeof addressOrDevice === 'string' ? name || 'Printer Thermal' : addressOrDevice.name || 'Printer Thermal';

    usePrinterStore.getState().setIsConnecting(true);

    try {
      await BluetoothManager.connect(address);
      usePrinterStore.getState().setPrinter(address, printerName);
      return { success: true };
    } catch (err: any) {
      console.warn('[BT Printer] Connect failed:', err);
      usePrinterStore.getState().disconnect();
      return {
        success: false,
        error: err?.message || 'Tidak dapat terhubung ke printer. Pastikan printer menyala.',
      };
    } finally {
      usePrinterStore.getState().setIsConnecting(false);
    }
  },

  /**
   * Disconnect current Bluetooth Printer
   */
  async disconnect(): Promise<void> {
    const { printerTarget, connectedPrinter } = usePrinterStore.getState();
    const target = printerTarget || connectedPrinter?.address;
    if (target && BluetoothManager) {
      try {
        await BluetoothManager.disconnect(target);
      } catch (err) {
        console.warn('[BT Printer] Disconnect error:', err);
      }
    }
    usePrinterStore.getState().disconnect();
  },

  /**
   * Ensure printer socket connection is established before issuing print commands
   */
  async ensureConnected(address?: string): Promise<boolean> {
    if (!BluetoothManager) return false;
    const targetAddress = address || usePrinterStore.getState().printerTarget || usePrinterStore.getState().connectedPrinter?.address;
    if (!targetAddress) return false;

    try {
      if (typeof BluetoothManager.isDeviceConnected === 'function') {
        const isConnected = await BluetoothManager.isDeviceConnected();
        if (isConnected) return true;
      }
      await BluetoothManager.connect(targetAddress);
      usePrinterStore.getState().setConnected(true);
      return true;
    } catch (e) {
      console.warn('[BT Printer] ensureConnected reconnect failed:', e);
      return false;
    }
  },

  /**
   * Test Print directly to thermal printer
   */
  async testPrint(printer?: BluetoothDevice | null, paperWidth: '58mm' | '80mm' = '58mm'): Promise<void> {
    if (!BluetoothEscposPrinter) {
      throw new Error('Modul printer Bluetooth native tidak tersedia di lingkungan ini.');
    }

    await this.ensureConnected(printer?.address);

    const W = paperWidth === '80mm' ? 42 : 32;
    const divider = '='.repeat(W);
    const thin = '-'.repeat(W);

    let settings = null;
    try {
      settings = await settingsService.getSettings();
    } catch {}

    const storeTitle = (settings?.nama_toko || 'LETTE ROTI BAKAR').toUpperCase();
    const branchTitle = settings?.nama_cabang || '';

    await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
    await BluetoothEscposPrinter.printText(storeTitle + '\n', {});
    if (branchTitle) {
      await BluetoothEscposPrinter.printText(branchTitle + '\n', {});
    }
    await BluetoothEscposPrinter.printText('TEST PRINT STRUK POS\n', {});
    await BluetoothEscposPrinter.printText(divider + '\n', {});
    await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.LEFT);
    await BluetoothEscposPrinter.printText(`Printer : ${printer?.name || usePrinterStore.getState().printerName || 'Bluetooth Printer'}\n`, {});
    await BluetoothEscposPrinter.printText(`Ukuran  : ${paperWidth}\n`, {});
    if (settings?.alamat_toko) {
      await BluetoothEscposPrinter.printText(`Alamat  : ${settings.alamat_toko}\n`, {});
    }
    if (settings?.telepon_toko) {
      await BluetoothEscposPrinter.printText(`Kontak  : ${settings.telepon_toko}\n`, {});
    }
    await BluetoothEscposPrinter.printText(`Waktu   : ${new Date().toLocaleTimeString('id-ID')}\n`, {});
    await BluetoothEscposPrinter.printText(thin + '\n', {});
    await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
    await BluetoothEscposPrinter.printText('PRINTER THERMAL SIAP!\n', {});
    await BluetoothEscposPrinter.printText('Cetak Langsung ESC/POS\n', {});
    if (settings?.footer_struk) {
      await BluetoothEscposPrinter.printText(settings.footer_struk + '\n', {});
    }
    await BluetoothEscposPrinter.printText(divider + '\n', {});
    await BluetoothEscposPrinter.printAndFeed(2);
    if (typeof BluetoothEscposPrinter.cutOnePoint === 'function') {
      BluetoothEscposPrinter.cutOnePoint();
    }
  },

  /**
   * Direct Physical ESC/POS Print Struk via Bluetooth without opening PDF Spooler
   */
  async printReceipt(
    trx: Transaction,
    storeNameOrPrinter: string | BluetoothDevice = 'LETTE ROTI BAKAR',
    paperWidth: '58mm' | '80mm' = '58mm'
  ): Promise<void> {
    if (!BluetoothEscposPrinter) {
      throw new Error('Modul printer Bluetooth native tidak tersedia.');
    }

    const { printerTarget, connectedPrinter } = usePrinterStore.getState();
    const address = printerTarget || connectedPrinter?.address;
    if (!address) {
      throw new Error('Printer thermal belum terhubung.');
    }

    await this.ensureConnected(address);

    let settings = null;
    try {
      settings = await settingsService.getSettings();
    } catch {}

    const storeName = settings?.nama_toko || (typeof storeNameOrPrinter === 'string' ? storeNameOrPrinter : 'LETTE ROTI BAKAR');
    const branchName = settings?.nama_cabang || '';
    const storeAddress = settings?.alamat_toko || '';
    const phone = settings?.telepon_toko || '';
    const footerMsg = settings?.footer_struk || 'Terima Kasih Atas Kunjungan Anda!';

    const W = paperWidth === '80mm' ? 42 : 32;
    const divider = '='.repeat(W);
    const thin = '-'.repeat(W);

    const formatItemLine = (name: string, qty: number): string => {
      const maxNameLen = W - 7;
      const label = name.length > maxNameLen ? name.slice(0, maxNameLen - 2) + '..' : name;
      const qtyStr = qty.toString() + 'x';
      return label.padEnd(W - 6) + qtyStr.padStart(6);
    };

    const formatPriceLine = (price: number, subtotal: number): string => {
      const left = formatIDR(price);
      const right = formatIDR(subtotal);
      const gap = W - left.length - right.length;
      return '  ' + left + ' '.repeat(Math.max(1, gap - 2)) + right;
    };

    const formatTotalLine = (label: string, value: string): string => {
      const gap = W - label.length - value.length;
      return label + ' '.repeat(Math.max(1, gap)) + value;
    };

    // 1. Header
    await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
    await BluetoothEscposPrinter.printText(storeName.toUpperCase() + '\n', {});
    if (branchName) {
      await BluetoothEscposPrinter.printText(branchName + '\n', {});
    }
    if (storeAddress) {
      await BluetoothEscposPrinter.printText(storeAddress + '\n', {});
    }
    if (phone) {
      await BluetoothEscposPrinter.printText('Telp/WA: ' + phone + '\n', {});
    }
    await BluetoothEscposPrinter.printText(divider + '\n', {});

    // 2. Transaction Meta
    await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.LEFT);
    const timeStr = formatTimeIndo(trx.tanggal);
    await BluetoothEscposPrinter.printText(formatTotalLine(`No: ${formatTransactionNo(trx.id, trx.tanggal)}`, timeStr) + '\n', {});
    await BluetoothEscposPrinter.printText(`Tgl: ${formatDateIndo(trx.tanggal)}\n`, {});
    await BluetoothEscposPrinter.printText(`Kasir: ${trx.kasir_name || 'Kasir'} | ${getChannelLabel(trx.channel)}\n`, {});
    const onlineMatch = trx.catatan?.match(/\[No\.\s*Pesanan:\s*([^\]]+)\]/i);
    if (onlineMatch) {
      await BluetoothEscposPrinter.printText(`No. Ojol: ${onlineMatch[1].trim()}\n`, {});
    }
    await BluetoothEscposPrinter.printText(`Metode: ${getPaymentMethodLabel(trx.metode_bayar)}\n`, {});
    await BluetoothEscposPrinter.printText(thin + '\n', {});

    // 3. Items
    for (const item of trx.items || []) {
      await BluetoothEscposPrinter.printText(formatItemLine(item.menu_name || 'Item', item.qty) + '\n', {});
      const variantDisplay = item.variant_names || (item.variant_ids && !item.variant_ids.startsWith('[') ? item.variant_ids : '');
      if (variantDisplay && variantDisplay.trim() !== '' && variantDisplay !== '[]') {
        await BluetoothEscposPrinter.printText(`  + ${variantDisplay.trim()}\n`, {});
      }
      if (item.custom_notes) {
        await BluetoothEscposPrinter.printText(`  * Note: ${item.custom_notes}\n`, {});
      }
      await BluetoothEscposPrinter.printText(formatPriceLine(item.harga_satuan, item.subtotal) + '\n', {});
    }
    await BluetoothEscposPrinter.printText(thin + '\n', {});

    // 4. Totals & Payment
    if (trx.tax_amount && trx.tax_amount > 0) {
      const sub = trx.subtotal || (trx.total - trx.tax_amount);
      await BluetoothEscposPrinter.printText(formatTotalLine('Subtotal', formatIDR(sub)) + '\n', {});
      await BluetoothEscposPrinter.printText(formatTotalLine(`PPN (${trx.tax_percentage || 10}%)`, formatIDR(trx.tax_amount)) + '\n', {});
    }
    await BluetoothEscposPrinter.printText(formatTotalLine('TOTAL', formatIDR(trx.total)) + '\n', {});
    if (trx.metode_bayar === 'tunai' && trx.uang_diterima !== undefined && trx.uang_diterima > 0) {
      await BluetoothEscposPrinter.printText(formatTotalLine('Tunai', formatIDR(trx.uang_diterima)) + '\n', {});
      await BluetoothEscposPrinter.printText(formatTotalLine('Kembali', formatIDR(trx.kembalian || 0)) + '\n', {});
    }

    if (trx.catatan) {
      const displayCatatan = trx.catatan.replace(/\[No\.\s*Pesanan:\s*[^\]]+\]/i, '').trim();
      if (displayCatatan) {
        await BluetoothEscposPrinter.printText(`Catatan: ${displayCatatan}\n`, {});
      }
    }

    // 5. Footer
    await BluetoothEscposPrinter.printerAlign(BluetoothEscposPrinter.ALIGN.CENTER);
    await BluetoothEscposPrinter.printText(divider + '\n', {});
    const footerLines = footerMsg.split('\n');
    for (const fl of footerLines) {
      if (fl.trim()) {
        await BluetoothEscposPrinter.printText(fl.trim() + '\n', {});
      }
    }

    // 6. Feed Paper & Cut (Clean cut hemat kertas, sesuai firmware thermal)
    await BluetoothEscposPrinter.printAndFeed(2);
    if (typeof BluetoothEscposPrinter.cutOnePoint === 'function') {
      BluetoothEscposPrinter.cutOnePoint();
    }
  },
};
