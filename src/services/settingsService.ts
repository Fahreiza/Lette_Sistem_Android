import { getDatabase } from '../database/db';
import { AppSettings } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  nama_toko: 'Lette Roti Bakar',
  nama_cabang: 'Cabang 1',
  alamat_toko: 'Jl. Merdeka No. 10',
  telepon_toko: '0812-3456-7890',
  footer_struk: 'Terima kasih atas kunjungan Anda!',
  enable_tax: false,
  tax_percentage: 10,
  service_charge: 0,
  qris_merchant_name: 'Lette Roti Bakar',
  qris_nmid: '',
  qris_image_url: '',
};

export const settingsService = {
  async getSettings(): Promise<AppSettings> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{
      nama_toko: string;
      nama_cabang: string;
      alamat_toko: string;
      telepon_toko: string;
      footer_struk: string;
      enable_tax: number;
      tax_percentage: number;
      service_charge: number;
      qris_merchant_name: string | null;
      qris_nmid: string | null;
      qris_image_url: string | null;
      bridge_server_url: string | null;
      device_id: string | null;
    }>('SELECT * FROM app_settings WHERE id = 1 LIMIT 1;');

    if (!row) {
      return DEFAULT_SETTINGS;
    }

    return {
      nama_toko: row.nama_toko || DEFAULT_SETTINGS.nama_toko,
      nama_cabang: row.nama_cabang || DEFAULT_SETTINGS.nama_cabang,
      alamat_toko: row.alamat_toko || DEFAULT_SETTINGS.alamat_toko,
      telepon_toko: row.telepon_toko || DEFAULT_SETTINGS.telepon_toko,
      footer_struk: row.footer_struk || DEFAULT_SETTINGS.footer_struk,
      enable_tax: row.enable_tax === 1,
      tax_percentage: row.tax_percentage ?? DEFAULT_SETTINGS.tax_percentage,
      service_charge: row.service_charge ?? DEFAULT_SETTINGS.service_charge,
      qris_merchant_name: row.qris_merchant_name || undefined,
      qris_nmid: row.qris_nmid || undefined,
      qris_image_url: row.qris_image_url || undefined,
      bridge_server_url: row.bridge_server_url || undefined,
      device_id: row.device_id || undefined,
    };
  },

  async updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    const db = await getDatabase();
    const current = await this.getSettings();
    const merged = { ...current, ...updates };

    await db.runAsync(
      `INSERT INTO app_settings (
        id, nama_toko, nama_cabang, alamat_toko, telepon_toko, footer_struk,
        enable_tax, tax_percentage, service_charge, qris_merchant_name, qris_nmid, qris_image_url, bridge_server_url, device_id
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        nama_toko = excluded.nama_toko,
        nama_cabang = excluded.nama_cabang,
        alamat_toko = excluded.alamat_toko,
        telepon_toko = excluded.telepon_toko,
        footer_struk = excluded.footer_struk,
        enable_tax = excluded.enable_tax,
        tax_percentage = excluded.tax_percentage,
        service_charge = excluded.service_charge,
        qris_merchant_name = excluded.qris_merchant_name,
        qris_nmid = excluded.qris_nmid,
        qris_image_url = excluded.qris_image_url,
        bridge_server_url = excluded.bridge_server_url,
        device_id = excluded.device_id;`,
      [
        merged.nama_toko,
        merged.nama_cabang,
        merged.alamat_toko,
        merged.telepon_toko,
        merged.footer_struk,
        merged.enable_tax ? 1 : 0,
        merged.tax_percentage,
        merged.service_charge,
        merged.qris_merchant_name || null,
        merged.qris_nmid || null,
        merged.qris_image_url || null,
        merged.bridge_server_url || null,
        merged.device_id || null,
      ]
    );

    return merged;
  },

  async resetSalesData(): Promise<void> {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM transaction_items;');
      await db.runAsync('DELETE FROM transactions;');
      await db.runAsync('DELETE FROM shifts;');
      await db.runAsync('DELETE FROM expenses;');
      await db.runAsync("DELETE FROM stock_movements WHERE sumber != 'Inisialisasi';");
    });
  },
};
