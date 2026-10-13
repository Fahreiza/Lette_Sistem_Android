import { getDatabase, runWithDbLock } from '../database/db';
import { settingsService } from './settingsService';
import { getSeedData } from '../database/seed';
import { hashPin } from '../utils/crypto';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

export interface DatabaseStats {
  totalTransactions: number;
  totalMenuItems: number;
  totalIngredients: number;
  totalLogs: number;
  totalExpenses: number;
  totalShifts: number;
}

export const dataService = {
  /**
   * Mengambil statistik ringkas database lokal SQLite
   */
  async getDatabaseStats(): Promise<DatabaseStats> {
    const db = await getDatabase();
    try {
      const [
        txRow,
        menuRow,
        ingRow,
        logRow,
        expRow,
        shiftRow,
      ] = await Promise.all([
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM transactions;'),
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM menu_items;'),
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM ingredients;'),
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM activity_logs;'),
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM expenses;'),
        db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM shifts;'),
      ]);

      return {
        totalTransactions: txRow?.count ?? 0,
        totalMenuItems: menuRow?.count ?? 0,
        totalIngredients: ingRow?.count ?? 0,
        totalLogs: logRow?.count ?? 0,
        totalExpenses: expRow?.count ?? 0,
        totalShifts: shiftRow?.count ?? 0,
      };
    } catch (e) {
      console.warn('Failed to get database stats:', e);
      return {
        totalTransactions: 0,
        totalMenuItems: 0,
        totalIngredients: 0,
        totalLogs: 0,
        totalExpenses: 0,
        totalShifts: 0,
      };
    }
  },

  /**
   * Reset seluruh riwayat transaksi, shift kasir, dan pengeluaran.
   * Data master (Menu, Kategori, Varian, Pengguna, dan Bahan) tetap utuh & aman.
   */
  async resetSalesData(): Promise<void> {
    await settingsService.resetSalesData();
  },

  /**
   * Hapus log aktivitas lama (> 30 hari) untuk menghemat ruang penyimpanan.
   */
  async clearOldLogs(days: number = 30): Promise<number> {
    const db = await getDatabase();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const isoString = cutoffDate.toISOString();

    const res = await db.runAsync(
      'DELETE FROM activity_logs WHERE timestamp < ?;',
      [isoString]
    );
    return res.changes;
  },

  /**
   * Optimalkan dan bersihkan cache database (VACUUM SQLite)
   */
  async optimizeDatabase(): Promise<void> {
    const db = await getDatabase();
    await db.execAsync('VACUUM;');
  },

  /**
   * Kosongkan seluruh daftar menu, varian, dan resep di aplikasi.
   */
  async clearAllMenusAndRecipes(): Promise<void> {
    return runWithDbLock(async () => {
      const db = await getDatabase();
      await db.execAsync('PRAGMA foreign_keys = OFF;');
      try {
        await db.withTransactionAsync(async () => {
          await db.runAsync('DELETE FROM recipes;');
          await db.runAsync('DELETE FROM menu_variants;');
          await db.runAsync('DELETE FROM master_variants;');
          await db.runAsync('DELETE FROM menu_items;');
          await db.runAsync('DELETE FROM deleted_menu_items;');
        });
      } finally {
        await db.execAsync('PRAGMA foreign_keys = ON;');
      }
    });
  },

  /**
   * Kosongkan seluruh data inventori / bahan baku dan riwayat mutasi stok.
   */
  async clearAllStock(): Promise<void> {
    return runWithDbLock(async () => {
      const db = await getDatabase();
      await db.execAsync('PRAGMA foreign_keys = OFF;');
      try {
        await db.withTransactionAsync(async () => {
          await db.runAsync('DELETE FROM stock_movements;');
          await db.runAsync('DELETE FROM recipes;');
          await db.runAsync('DELETE FROM ingredients;');
        });
      } finally {
        await db.execAsync('PRAGMA foreign_keys = ON;');
      }
    });
  },

  /**
   * Reset database ke default:
   * - HANYA Akun Admin / Owner (PIN: 123456)
   * - 52 Master Bahan Baku Stok (stok 0)
   * - Transaksi, shift kasir, pengeluaran, resep, menu dummy, dan kasir lain dihapus total.
   */
  async resetToDefaultOnlyAdminAndStock(): Promise<void> {
    return runWithDbLock(async () => {
      const db = await getDatabase();
      // PRAGMA foreign_keys = OFF harus dieksekusi SEBELUM transaksi dibuka
      await db.execAsync('PRAGMA foreign_keys = OFF;');
      try {
        await db.withTransactionAsync(async () => {
          // 1. Bersihkan transaksi, item transaksi, shift, dan pengeluaran
          await db.runAsync('DELETE FROM transaction_items;');
          await db.runAsync('DELETE FROM transactions;');
          await db.runAsync('DELETE FROM shifts;');
          await db.runAsync('DELETE FROM expenses;');
          await db.runAsync('DELETE FROM deleted_expenses;');

          // 2. Bersihkan katalog menu, varian, dan resep
          await db.runAsync('DELETE FROM recipes;');
          await db.runAsync('DELETE FROM menu_variants;');
          await db.runAsync('DELETE FROM master_variants;');
          await db.runAsync('DELETE FROM menu_items;');
          await db.runAsync('DELETE FROM deleted_menu_items;');

          // 3. Bersihkan mutasi stok dan dompet
          await db.runAsync('DELETE FROM stock_movements;');
          await db.runAsync('DELETE FROM wallet_transfers;');
          await db.runAsync('DELETE FROM balance_adjustments;');

          // 4. Reset saldo awal di pengaturan
          await db.runAsync(
            'UPDATE app_settings SET saldo_awal_laci = 0, saldo_awal_manager = 0, saldo_awal_rekening = 0 WHERE id = 1;'
          );

          // 5. Bersihkan seluruh log aktivitas SEBELUM menghapus user kasir
          //    agar tidak melanggar foreign key constraint pada user_id
          await db.runAsync('DELETE FROM activity_logs;');

          // 6. Hapus user selain owner dan bersihkan tombstone user
          await db.runAsync("DELETE FROM users WHERE role != 'owner';");
          await db.runAsync('DELETE FROM deleted_users;');

          // 7. Reset stok bahan menjadi 0
          await db.runAsync('UPDATE ingredients SET stok_saat_ini = 0;');

          // 8. Cek apakah ada master bahan baku; jika kosong, masukkan 52 bahan baku default
          const ingCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM ingredients;');
          if (!ingCount || ingCount.count === 0) {
            const seed = await getSeedData();
            for (const ing of seed.ingredients) {
              await db.runAsync(
                `INSERT INTO ingredients (nama, satuan, harga_beli_satuan, stok_saat_ini, stok_minimum, urutan) VALUES (?, ?, ?, 0, ?, ?);`,
                [ing.nama, ing.satuan, ing.harga_beli_satuan || 0, ing.stok_minimum || 0, ing.urutan || 0]
              );
            }
          }

          // 9. Pastikan akun owner tetap ada; jika tidak ada, buat akun owner baru
          let owner = await db.getFirstAsync<{ id: number }>(
            "SELECT id FROM users WHERE role = 'owner' LIMIT 1;"
          );
          if (!owner) {
            const ownerPinHash = await hashPin('123456');
            const res = await db.runAsync(
              "INSERT INTO users (nama, pin_hash, role, status_aktif, created_at) VALUES ('Admin / Owner', ?, 'owner', 1, datetime('now'));",
              [ownerPinHash]
            );
            owner = { id: res.lastInsertRowId };
          }

          // 10. Catat log aktivitas reset dengan user_id owner yang valid
          await db.runAsync(
            "INSERT INTO activity_logs (user_id, aksi, detail, timestamp) VALUES (?, 'DEFAULT_RESET', 'Reset database ke default: Hanya Admin dan 52 Stok Bahan', datetime('now'));",
            [owner.id]
          );
        });
      } finally {
        await db.execAsync('PRAGMA foreign_keys = ON;');
      }
    });
  },

  /**
   * Reset total seluruh isi database menjadi 0
   */
  async resetAllToZero(): Promise<void> {
    return runWithDbLock(async () => {
      const db = await getDatabase();
      await db.execAsync('PRAGMA foreign_keys = OFF;');
      try {
        await db.withTransactionAsync(async () => {
          await db.runAsync('DELETE FROM transaction_items;');
          await db.runAsync('DELETE FROM transactions;');
          await db.runAsync('DELETE FROM shifts;');
          await db.runAsync('DELETE FROM expenses;');
          await db.runAsync('DELETE FROM deleted_expenses;');
          await db.runAsync('DELETE FROM recipes;');
          await db.runAsync('DELETE FROM menu_variants;');
          await db.runAsync('DELETE FROM master_variants;');
          await db.runAsync('DELETE FROM menu_items;');
          await db.runAsync('DELETE FROM deleted_menu_items;');
          await db.runAsync('DELETE FROM stock_movements;');
          await db.runAsync('DELETE FROM wallet_transfers;');
          await db.runAsync('DELETE FROM balance_adjustments;');
          await db.runAsync(
            'UPDATE app_settings SET saldo_awal_laci = 0, saldo_awal_manager = 0, saldo_awal_rekening = 0 WHERE id = 1;'
          );
          await db.runAsync('DELETE FROM ingredients;');
          await db.runAsync('DELETE FROM activity_logs;');
          await db.runAsync("DELETE FROM users WHERE role = 'kasir';");
          await db.runAsync('DELETE FROM deleted_users;');

          const owner = await db.getFirstAsync<{ id: number }>(
            "SELECT id FROM users WHERE role = 'owner' LIMIT 1;"
          );
          const ownerId = owner?.id ?? 1;

          await db.runAsync(
            "INSERT INTO activity_logs (user_id, aksi, detail, timestamp) VALUES (?, 'FULL_RESET_DATABASE_ZERO', 'Reset total database ke 0 oleh admin', datetime('now'));",
            [ownerId]
          );
        });
      } finally {
        await db.execAsync('PRAGMA foreign_keys = ON;');
      }
    });
  },

  /**
   * Ekspor seluruh tabel database lokal ke JSON dan bagikan via expo-sharing
   */
  async exportFullDatabaseBackup(): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const db = await getDatabase();
      const [
        users,
        categories,
        menuItems,
        variants,
        masterVariants,
        ingredients,
        recipes,
        transactions,
        transactionItems,
        shifts,
        expenses,
        stockMovements,
        logs,
        appSettings,
        walletTransfers,
        balanceAdjustments,
      ] = await Promise.all([
        db.getAllAsync('SELECT * FROM users;'),
        db.getAllAsync('SELECT * FROM menu_categories;'),
        db.getAllAsync('SELECT * FROM menu_items;'),
        db.getAllAsync('SELECT * FROM menu_variants;'),
        db.getAllAsync('SELECT * FROM master_variants;'),
        db.getAllAsync('SELECT * FROM ingredients;'),
        db.getAllAsync('SELECT * FROM recipes;'),
        db.getAllAsync('SELECT * FROM transactions;'),
        db.getAllAsync('SELECT * FROM transaction_items;'),
        db.getAllAsync('SELECT * FROM shifts;'),
        db.getAllAsync('SELECT * FROM expenses;'),
        db.getAllAsync('SELECT * FROM stock_movements;'),
        db.getAllAsync('SELECT * FROM activity_logs;'),
        db.getAllAsync('SELECT * FROM app_settings;'),
        db.getAllAsync('SELECT * FROM wallet_transfers;'),
        db.getAllAsync('SELECT * FROM balance_adjustments;'),
      ]);

      const backup = {
        version: '1.2.0',
        appName: 'Lette Kasir Android',
        source: 'android',
        exportedAt: new Date().toISOString(),
        tables: {
          users,
          categories,
          items: menuItems,
          variants,
          master_variants: masterVariants,
          ingredients,
          recipes,
          transactions,
          transaction_items: transactionItems,
          shifts,
          expenses,
          stock_movements: stockMovements,
          logs,
          app_settings: appSettings,
          wallet_transfers: walletTransfers,
          balance_adjustments: balanceAdjustments,
        },
      };

      const jsonStr = JSON.stringify(backup, null, 2);
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `lette-kasir-android-backup-${dateStr}.json`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, jsonStr, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/json',
          dialogTitle: 'Simpan / Bagikan Backup Database Lette',
          UTI: 'public.json',
        });
      }

      return { success: true, filePath };
    } catch (e: any) {
      console.error('Failed to export full database backup:', e);
      return { success: false, error: e?.message || 'Gagal mengekspor data backup.' };
    }
  },

  /**
   * Pulihkan seluruh database lokal dari data JSON backup
   */
  async importFullDatabaseBackup(backupJson: string): Promise<{ success: boolean; message: string }> {
    try {
      const parsed = JSON.parse(backupJson);
      const tables = parsed.tables || parsed.data || parsed;
      if (!tables) {
        return { success: false, message: 'Format file backup tidak valid (tabel tidak ditemukan).' };
      }

      return await runWithDbLock(async () => {
        const db = await getDatabase();
        await db.execAsync('PRAGMA foreign_keys = OFF;');
        try {
          await db.withTransactionAsync(async () => {
            // Restore users if available
            if (Array.isArray(tables.users) && tables.users.length > 0) {
              await db.runAsync('DELETE FROM users;');
              for (const u of tables.users) {
                await db.runAsync(
                  'INSERT OR REPLACE INTO users (id, nama, pin_hash, role, status_aktif, created_at) VALUES (?, ?, ?, ?, ?, ?);',
                  [u.id, u.nama, u.pin_hash, u.role || 'kasir', u.status_aktif !== undefined ? u.status_aktif : 1, u.created_at || new Date().toISOString()]
                );
              }
            }

            // Restore categories
            if (Array.isArray(tables.categories || tables.menu_categories)) {
              const cats = tables.categories || tables.menu_categories;
              await db.runAsync('DELETE FROM menu_categories;');
              for (const c of cats) {
                await db.runAsync(
                  'INSERT OR REPLACE INTO menu_categories (id, nama) VALUES (?, ?);',
                  [c.id, c.nama]
                );
              }
            }

            // Restore menu items
            if (Array.isArray(tables.items || tables.menu_items)) {
              const items = tables.items || tables.menu_items;
              await db.runAsync('DELETE FROM menu_items;');
              for (const it of items) {
                await db.runAsync(
                  `INSERT OR REPLACE INTO menu_items (id, category_id, nama, harga_offline, harga_gofood, harga_shopeefood, harga_grabfood, status_tersedia, image_url, is_synced)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1);`,
                  [
                    it.id,
                    it.category_id,
                    it.nama,
                    it.harga_offline ?? (it as any).harga ?? 0,
                    it.harga_gofood ?? it.harga_offline ?? (it as any).harga ?? 0,
                    it.harga_shopeefood ?? it.harga_offline ?? (it as any).harga ?? 0,
                    it.harga_grabfood ?? it.harga_offline ?? (it as any).harga ?? 0,
                    it.status_tersedia ? 1 : 0,
                    it.image_url || null,
                  ]
                );
              }
            }

            // Restore master variants
            if (Array.isArray(tables.master_variants || tables.masterVariants)) {
              const mVars = tables.master_variants || tables.masterVariants;
              await db.runAsync('DELETE FROM master_variants;');
              for (const mv of mVars) {
                const ingsListStr = typeof mv.ingredients_list === 'object' && mv.ingredients_list !== null
                  ? JSON.stringify(mv.ingredients_list)
                  : (mv.ingredients_list || null);
                await db.runAsync(
                  `INSERT OR REPLACE INTO master_variants (id, nama_varian, harga_tambahan, harga_offline, harga_gofood, harga_shopeefood, harga_grabfood, kategori_varian, ingredient_id, jumlah_terpakai, ingredients_list)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                  [
                    mv.id,
                    mv.nama_varian,
                    mv.harga_tambahan || 0,
                    mv.harga_offline ?? mv.harga_tambahan ?? 0,
                    mv.harga_gofood ?? mv.harga_offline ?? mv.harga_tambahan ?? 0,
                    mv.harga_shopeefood ?? mv.harga_offline ?? mv.harga_tambahan ?? 0,
                    mv.harga_grabfood ?? mv.harga_offline ?? mv.harga_tambahan ?? 0,
                    mv.kategori_varian || null,
                    mv.ingredient_id || null,
                    mv.jumlah_terpakai || 0,
                    ingsListStr,
                  ]
                );
              }
            }

            // Restore menu variants
            if (Array.isArray(tables.variants || tables.menu_variants)) {
              const vars = tables.variants || tables.menu_variants;
              await db.runAsync('DELETE FROM menu_variants;');
              for (const v of vars) {
                const ingsListStr = typeof v.ingredients_list === 'object' && v.ingredients_list !== null
                  ? JSON.stringify(v.ingredients_list)
                  : (v.ingredients_list || null);
                await db.runAsync(
                  `INSERT OR REPLACE INTO menu_variants (id, menu_item_id, nama_varian, harga_tambahan, harga_offline, harga_gofood, harga_shopeefood, harga_grabfood, master_variant_id, ingredient_id, jumlah_terpakai, ingredients_list, kategori_varian)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                  [
                    v.id,
                    v.menu_item_id,
                    v.nama_varian,
                    v.harga_tambahan || 0,
                    v.harga_offline ?? v.harga_tambahan ?? 0,
                    v.harga_gofood ?? v.harga_offline ?? v.harga_tambahan ?? 0,
                    v.harga_shopeefood ?? v.harga_offline ?? v.harga_tambahan ?? 0,
                    v.harga_grabfood ?? v.harga_offline ?? v.harga_tambahan ?? 0,
                    v.master_variant_id || null,
                    v.ingredient_id || null,
                    v.jumlah_terpakai || 0,
                    ingsListStr,
                    v.kategori_varian || null,
                  ]
                );
              }
            }

            // Restore ingredients
            if (Array.isArray(tables.ingredients)) {
              await db.runAsync('DELETE FROM ingredients;');
              for (const ing of tables.ingredients) {
                await db.runAsync(
                  `INSERT OR REPLACE INTO ingredients (id, nama, satuan, stok_saat_ini, stok_minimum, harga_beli_satuan, urutan)
                   VALUES (?, ?, ?, ?, ?, ?, ?);`,
                  [ing.id, ing.nama, ing.satuan || 'pcs', ing.stok_saat_ini || 0, ing.stok_minimum || 0, ing.harga_beli_satuan || 0, ing.urutan || 0]
                );
              }
            }

            // Restore recipes
            if (Array.isArray(tables.recipes)) {
              await db.runAsync('DELETE FROM recipes;');
              for (const r of tables.recipes) {
                await db.runAsync(
                  'INSERT OR REPLACE INTO recipes (id, menu_item_id, ingredient_id, jumlah_terpakai) VALUES (?, ?, ?, ?);',
                  [r.id, r.menu_item_id, r.ingredient_id, r.jumlah_terpakai || 1]
                );
              }
            }

            // Restore transactions
            if (Array.isArray(tables.transactions)) {
              await db.runAsync('DELETE FROM transactions;');
              for (const t of tables.transactions) {
                await db.runAsync(
                  `INSERT OR REPLACE INTO transactions (id, uuid, tanggal, channel, metode_bayar, subtotal, tax_percentage, tax_amount, total, uang_diterima, kembalian, status, kasir_id, shift_id, catatan, is_synced, desktop_order_id, source, alasan_void, void_at, sumber_dana)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?);`,
                  [
                    t.id,
                    t.uuid || null,
                    t.tanggal,
                    t.channel || 'offline',
                    t.metode_bayar || 'tunai',
                    t.subtotal || t.total || 0,
                    t.tax_percentage || 0,
                    t.tax_amount || 0,
                    t.total || 0,
                    t.uang_diterima || t.total || 0,
                    t.kembalian || 0,
                    t.status || 'selesai',
                    t.kasir_id || 1,
                    t.shift_id || null,
                    t.catatan || '',
                    t.desktop_order_id || null,
                    t.source || 'backup',
                    t.alasan_void || null,
                    t.void_at || null,
                    t.sumber_dana || 'laci_kasir',
                  ]
                );
              }
            }

            // Restore transaction items
            if (Array.isArray(tables.transaction_items || tables.tx_items)) {
              const tItems = tables.transaction_items || tables.tx_items;
              await db.runAsync('DELETE FROM transaction_items;');
              for (const ti of tItems) {
                await db.runAsync(
                  `INSERT OR REPLACE INTO transaction_items (id, transaction_id, menu_item_id, menu_name, variant_ids, custom_notes, qty, harga_satuan, subtotal)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                  [ti.id, ti.transaction_id, ti.menu_item_id, ti.menu_name || ti.menu_item_nama || 'Item', ti.variant_ids || '', ti.custom_notes || '', ti.qty || 1, ti.harga_satuan || 0, ti.subtotal || 0]
                );
              }
            }

            // Restore shifts
            if (Array.isArray(tables.shifts)) {
              await db.runAsync('DELETE FROM shifts;');
              for (const s of tables.shifts) {
                await db.runAsync(
                  `INSERT OR REPLACE INTO shifts (id, kasir_id, kasir_nama, waktu_buka, waktu_tutup, modal_awal, saldo_shift_sebelumnya, selisih_serah_terima, catatan_serah_terima, shift_sebelumnya_id, total_penjualan_tunai, total_penjualan_qris, total_penjualan_online, total_pengeluaran_kas, total_sistem_tunai, uang_fisik_aktual, selisih, catatan_closing, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
                  [
                    s.id, s.kasir_id, s.kasir_nama || 'Kasir', s.waktu_buka, s.waktu_tutup || null,
                    s.modal_awal || 0, s.saldo_shift_sebelumnya || 0, s.selisih_serah_terima || 0, s.catatan_serah_terima || null,
                    s.shift_sebelumnya_id || null, s.total_penjualan_tunai || 0, s.total_penjualan_qris || 0, s.total_penjualan_online || 0,
                    s.total_pengeluaran_kas || 0, s.total_sistem_tunai || 0, s.uang_fisik_aktual || 0, s.selisih || 0, s.catatan_closing || null,
                    s.status || 'closed'
                  ]
                );
              }
            }

            // Restore expenses
            if (Array.isArray(tables.expenses)) {
              await db.runAsync('DELETE FROM expenses;');
              for (const e of tables.expenses) {
                await db.runAsync(
                  `INSERT OR REPLACE INTO expenses (id, tanggal, kategori, jumlah, keterangan, input_by, sumber_dana, shift_id, is_synced, desktop_expense_id)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?);`,
                  [e.id, e.tanggal, e.kategori || 'Operasional Lain', e.jumlah || 0, e.keterangan || '', e.input_by || 1, e.sumber_dana || 'laci_kasir', e.shift_id || null, e.desktop_expense_id || null]
                );
              }
            }

            // Restore stock movements
            if (Array.isArray(tables.stock_movements)) {
              await db.runAsync('DELETE FROM stock_movements;');
              for (const sm of tables.stock_movements) {
                await db.runAsync(
                  `INSERT OR REPLACE INTO stock_movements (id, ingredient_id, tipe, jumlah, tanggal, keterangan, sumber, is_synced)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 1);`,
                  [sm.id, sm.ingredient_id, sm.tipe || 'adjustment', sm.jumlah || 0, sm.tanggal || new Date().toISOString(), sm.keterangan || '', sm.sumber || 'backup']
                );
              }
            }

            // Restore app_settings
            if (Array.isArray(tables.app_settings || tables.settings) || tables.settings) {
              const sets = Array.isArray(tables.app_settings || tables.settings)
                ? (tables.app_settings || tables.settings)[0]
                : tables.settings;
              if (sets) {
                await db.runAsync(
                  `UPDATE app_settings SET 
                     nama_toko = ?, alamat_toko = ?, telepon_toko = ?, footer_struk = ?, 
                     saldo_awal_laci = ?, saldo_awal_manager = ?, saldo_awal_rekening = ?
                   WHERE id = 1;`,
                  [
                    sets.nama_toko || 'Lette Roti Bakar',
                    sets.alamat_toko || '',
                    sets.telepon_toko || '',
                    sets.footer_struk || 'Terima kasih atas kunjungan Anda!',
                    sets.saldo_awal_laci || 0,
                    sets.saldo_awal_manager || 0,
                    sets.saldo_awal_rekening || 0,
                  ]
                );
              }
            }

            // Restore wallet_transfers
            if (Array.isArray(tables.wallet_transfers)) {
              await db.runAsync('DELETE FROM wallet_transfers;');
              for (const wt of tables.wallet_transfers) {
                await db.runAsync(
                  `INSERT OR REPLACE INTO wallet_transfers (id, tanggal, from_wallet, to_wallet, jumlah, keterangan, user_id, is_synced)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 1);`,
                  [wt.id, wt.tanggal, wt.from_wallet, wt.to_wallet, wt.jumlah || 0, wt.keterangan || '', wt.user_id || 1]
                );
              }
            }

            // Restore balance_adjustments
            if (Array.isArray(tables.balance_adjustments)) {
              await db.runAsync('DELETE FROM balance_adjustments;');
              for (const ba of tables.balance_adjustments) {
                await db.runAsync(
                  `INSERT OR REPLACE INTO balance_adjustments (id, tanggal, dompet, saldo_tercatat, saldo_fisik, selisih, tipe_penyesuaian, alasan, user_id, is_synced)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1);`,
                  [ba.id, ba.tanggal, ba.dompet, ba.saldo_tercatat || 0, ba.saldo_fisik || 0, ba.selisih || 0, ba.tipe_penyesuaian || 'koreksi', ba.alasan || '', ba.user_id || 1]
                );
              }
            }

            const owner = await db.getFirstAsync<{ id: number }>(
              "SELECT id FROM users WHERE role = 'owner' LIMIT 1;"
            );
            const ownerId = owner?.id ?? 1;

            await db.runAsync(
              "INSERT INTO activity_logs (user_id, aksi, detail, timestamp) VALUES (?, 'DATABASE_RESTORED', 'Database berhasil dipulihkan dari file backup', datetime('now'));",
              [ownerId]
            );
          });
        } finally {
          await db.execAsync('PRAGMA foreign_keys = ON;');
        }

        return { success: true, message: 'Seluruh database berhasil dipulihkan dari file backup.' };
      });
    } catch (err: any) {
      console.error('Failed to import full database backup:', err);
      return { success: false, message: `Gagal memulihkan backup: ${err?.message || 'Format JSON tidak valid'}` };
    }
  },
};
