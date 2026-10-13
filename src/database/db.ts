import * as SQLite from 'expo-sqlite';
import { CREATE_TABLES_SQL } from './schema';
import { getSeedData } from './seed';
import { hashPin } from '../utils/crypto';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let initPromise: Promise<void> | null = null;
let isDbInitialized = false;

// Global serial lock queue for SQLite write transactions to prevent concurrency collisions
let dbLockQueue: Promise<any> = Promise.resolve();
export async function runWithDbLock<T>(task: () => Promise<T>): Promise<T> {
  const prevQueue = dbLockQueue;
  let nextResolve: () => void;
  const nextPromise = new Promise<void>((resolve) => {
    nextResolve = resolve;
  });
  dbLockQueue = nextPromise;

  try {
    // Wait for prior DB writes to complete, but guard with an 8-second safety timeout
    // to guarantee the UI or payment flow NEVER freezes forever even in deadlock or slow I/O
    await Promise.race([
      prevQueue.catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 8000)),
    ]);
    return await task();
  } finally {
    nextResolve!();
  }
}

export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('lette_kasir.db');
      await db.execAsync('PRAGMA journal_mode = WAL;');
      await db.execAsync('PRAGMA busy_timeout = 10000;');
      await db.execAsync('PRAGMA foreign_keys = ON;');
      return db;
    })().catch((err) => {
      dbPromise = null; // Allow retry on failure
      throw err;
    });
  }
  return dbPromise;
}

export function initDatabase(): Promise<void> {
  if (isDbInitialized) {
    return Promise.resolve();
  }
  if (initPromise) {
    return initPromise;
  }

  initPromise = (async () => {
    const db = await getDatabase();

    // 1. Create tables safely
    try {
      await db.execAsync(CREATE_TABLES_SQL);
    } catch (e) {
      console.warn('[DB] Table creation warning (running fallback per-table):', e);
      // If batch exec failed, run each statement individually
      const statements = CREATE_TABLES_SQL.split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));
      for (const stmt of statements) {
        try {
          await db.execAsync(stmt + ';');
        } catch (stmtErr) {
          console.warn('[DB] Per-table statement warning:', stmtErr);
        }
      }
    }

    // 2. Safe migrations for existing SQLite databases on devices
    const runMigration = async (sql: string) => {
      try {
        await db.runAsync(sql);
      } catch {
        // Column/table/index already exists or safe to ignore
      }
    };

    // Columns: transactions
    await runMigration("ALTER TABLE transactions ADD COLUMN uuid TEXT;");
    await runMigration("ALTER TABLE transactions ADD COLUMN subtotal REAL NOT NULL DEFAULT 0;");
    await runMigration("ALTER TABLE transactions ADD COLUMN tax_percentage REAL NOT NULL DEFAULT 0;");
    await runMigration("ALTER TABLE transactions ADD COLUMN tax_amount REAL NOT NULL DEFAULT 0;");
    await runMigration("ALTER TABLE transactions ADD COLUMN uang_diterima REAL NOT NULL DEFAULT 0;");
    await runMigration("ALTER TABLE transactions ADD COLUMN kembalian REAL NOT NULL DEFAULT 0;");
    await runMigration("ALTER TABLE transactions ADD COLUMN shift_id TEXT;");
    await runMigration("ALTER TABLE transactions ADD COLUMN alasan_void TEXT;");
    await runMigration("ALTER TABLE transactions ADD COLUMN void_at TEXT;");
    await runMigration("ALTER TABLE transactions ADD COLUMN is_synced INTEGER NOT NULL DEFAULT 0;");
    await runMigration("ALTER TABLE transactions ADD COLUMN desktop_order_id TEXT;");
    await runMigration("ALTER TABLE transactions ADD COLUMN source TEXT;");
    await runMigration("ALTER TABLE transactions ADD COLUMN online_voucher_discount REAL NOT NULL DEFAULT 0;");
    await runMigration("ALTER TABLE transactions ADD COLUMN online_commission_amount REAL NOT NULL DEFAULT 0;");
    await runMigration("ALTER TABLE transactions ADD COLUMN online_net_amount REAL NOT NULL DEFAULT 0;");
    await runMigration("ALTER TABLE transactions ADD COLUMN sumber_dana TEXT NOT NULL DEFAULT 'laci_kasir';");

    // Columns: expenses
    await runMigration("ALTER TABLE expenses ADD COLUMN sumber_dana TEXT NOT NULL DEFAULT 'laci_kasir';");
    await runMigration("ALTER TABLE expenses ADD COLUMN shift_id TEXT;");
    await runMigration("ALTER TABLE expenses ADD COLUMN is_synced INTEGER NOT NULL DEFAULT 0;");
    await runMigration("ALTER TABLE expenses ADD COLUMN desktop_expense_id TEXT;");

    // Columns: app_settings
    await runMigration("ALTER TABLE app_settings ADD COLUMN bridge_server_url TEXT;");
    await runMigration("ALTER TABLE app_settings ADD COLUMN device_id TEXT;");
    await runMigration("ALTER TABLE app_settings ADD COLUMN qris_merchant_name TEXT;");
    await runMigration("ALTER TABLE app_settings ADD COLUMN qris_nmid TEXT;");
    await runMigration("ALTER TABLE app_settings ADD COLUMN qris_image_url TEXT;");
    await runMigration("ALTER TABLE app_settings ADD COLUMN commission_shopee REAL NOT NULL DEFAULT 27.78;");
    await runMigration("ALTER TABLE app_settings ADD COLUMN commission_grab REAL NOT NULL DEFAULT 25;");
    await runMigration("ALTER TABLE app_settings ADD COLUMN commission_gofood REAL NOT NULL DEFAULT 20;");
    await runMigration("ALTER TABLE app_settings ADD COLUMN fee_gofood REAL NOT NULL DEFAULT 1000;");
    await runMigration("ALTER TABLE app_settings ADD COLUMN saldo_awal_laci REAL NOT NULL DEFAULT 0;");
    await runMigration("ALTER TABLE app_settings ADD COLUMN saldo_awal_manager REAL NOT NULL DEFAULT 0;");
    await runMigration("ALTER TABLE app_settings ADD COLUMN saldo_awal_rekening REAL NOT NULL DEFAULT 0;");

    // New Tables: wallet_transfers & balance_adjustments
    await runMigration("CREATE TABLE IF NOT EXISTS wallet_transfers (id TEXT PRIMARY KEY, tanggal TEXT NOT NULL, from_wallet TEXT NOT NULL, to_wallet TEXT NOT NULL, jumlah REAL NOT NULL, keterangan TEXT, actor_id INTEGER NOT NULL DEFAULT 1, actor_nama TEXT, created_at TEXT NOT NULL, is_synced INTEGER NOT NULL DEFAULT 0);");
    await runMigration("CREATE TABLE IF NOT EXISTS balance_adjustments (id TEXT PRIMARY KEY, tanggal TEXT NOT NULL, dompet TEXT NOT NULL, saldo_sebelum REAL NOT NULL, saldo_sesudah REAL NOT NULL, selisih REAL NOT NULL, alasan TEXT, actor_id INTEGER NOT NULL DEFAULT 1, actor_nama TEXT, created_at TEXT NOT NULL, is_synced INTEGER NOT NULL DEFAULT 0);");

    // Columns: transaction_items, menu_items, stock_movements, ingredients
    await runMigration("ALTER TABLE transaction_items ADD COLUMN menu_name TEXT;");
    await runMigration("ALTER TABLE transaction_items ADD COLUMN custom_notes TEXT;");
    await runMigration("ALTER TABLE menu_items ADD COLUMN is_synced INTEGER NOT NULL DEFAULT 1;");
    await runMigration("ALTER TABLE menu_items ADD COLUMN image_url TEXT;");
    await runMigration("ALTER TABLE stock_movements ADD COLUMN is_synced INTEGER NOT NULL DEFAULT 1;");
    await runMigration("ALTER TABLE ingredients ADD COLUMN harga_beli_satuan REAL NOT NULL DEFAULT 0;");
    await runMigration("ALTER TABLE ingredients ADD COLUMN urutan INTEGER NOT NULL DEFAULT 0;");
    await runMigration("CREATE TABLE IF NOT EXISTS deleted_expenses (id INTEGER PRIMARY KEY, deleted_at TEXT NOT NULL);");
    await runMigration("CREATE TABLE IF NOT EXISTS deleted_menu_items (id INTEGER PRIMARY KEY, nama TEXT, deleted_at TEXT NOT NULL);");
    await runMigration("CREATE TABLE IF NOT EXISTS deleted_users (id INTEGER PRIMARY KEY, nama TEXT, deleted_at TEXT NOT NULL);");
    await runMigration("CREATE TABLE IF NOT EXISTS master_variants (id INTEGER PRIMARY KEY AUTOINCREMENT, nama_varian TEXT NOT NULL, harga_tambahan REAL NOT NULL DEFAULT 0, kategori_varian TEXT, ingredient_id INTEGER, jumlah_terpakai REAL DEFAULT 0);");
    await runMigration("ALTER TABLE master_variants ADD COLUMN ingredient_id INTEGER;");
    await runMigration("ALTER TABLE master_variants ADD COLUMN jumlah_terpakai REAL DEFAULT 0;");
    await runMigration("ALTER TABLE master_variants ADD COLUMN harga_offline REAL DEFAULT 0;");
    await runMigration("ALTER TABLE master_variants ADD COLUMN harga_gofood REAL DEFAULT 0;");
    await runMigration("ALTER TABLE master_variants ADD COLUMN harga_shopeefood REAL DEFAULT 0;");
    await runMigration("ALTER TABLE master_variants ADD COLUMN harga_grabfood REAL DEFAULT 0;");
    await runMigration("ALTER TABLE master_variants ADD COLUMN ingredients_list TEXT;");
    await runMigration("ALTER TABLE menu_variants ADD COLUMN master_variant_id INTEGER;");
    await runMigration("ALTER TABLE menu_variants ADD COLUMN ingredient_id INTEGER;");
    await runMigration("ALTER TABLE menu_variants ADD COLUMN jumlah_terpakai REAL DEFAULT 0;");
    await runMigration("ALTER TABLE menu_variants ADD COLUMN harga_offline REAL DEFAULT 0;");
    await runMigration("ALTER TABLE menu_variants ADD COLUMN harga_gofood REAL DEFAULT 0;");
    await runMigration("ALTER TABLE menu_variants ADD COLUMN harga_shopeefood REAL DEFAULT 0;");
    await runMigration("ALTER TABLE menu_variants ADD COLUMN harga_grabfood REAL DEFAULT 0;");
    await runMigration("ALTER TABLE menu_variants ADD COLUMN ingredients_list TEXT;");
    await runMigration("ALTER TABLE menu_variants ADD COLUMN kategori_varian TEXT;");

    // 3. Performance Indexes (Run safely AFTER all columns exist)
    await runMigration("CREATE INDEX IF NOT EXISTS idx_menu_variants_master ON menu_variants (master_variant_id);");
    await runMigration("CREATE INDEX IF NOT EXISTS idx_transactions_tanggal ON transactions (tanggal);");
    await runMigration("CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions (status);");
    await runMigration("CREATE INDEX IF NOT EXISTS idx_wallet_transfers_tgl ON wallet_transfers (tanggal);");
    await runMigration("CREATE INDEX IF NOT EXISTS idx_balance_adj_tgl ON balance_adjustments (tanggal);");
    await runMigration("CREATE INDEX IF NOT EXISTS idx_transactions_shift ON transactions (shift_id);");
    await runMigration("CREATE INDEX IF NOT EXISTS idx_transactions_desktop_id ON transactions (desktop_order_id);");
    await runMigration("CREATE INDEX IF NOT EXISTS idx_transaction_items_trx ON transaction_items (transaction_id);");
    await runMigration("CREATE INDEX IF NOT EXISTS idx_stock_movements_ing ON stock_movements (ingredient_id);");
    await runMigration("CREATE INDEX IF NOT EXISTS idx_expenses_tanggal ON expenses (tanggal);");
    await runMigration("CREATE INDEX IF NOT EXISTS idx_expenses_desktop_id ON expenses (desktop_expense_id);");
    await runMigration("CREATE INDEX IF NOT EXISTS idx_shifts_kasir ON shifts (kasir_id);");
    await runMigration("CREATE INDEX IF NOT EXISTS idx_shifts_status ON shifts (status);");

    // Populate existing transaction_items menu_name from menu_items if null
    try {
      await db.runAsync(`
        UPDATE transaction_items
        SET menu_name = (SELECT nama FROM menu_items WHERE menu_items.id = transaction_items.menu_item_id)
        WHERE menu_name IS NULL OR menu_name = '';
      `);
    } catch {}

    // Ensure database content is set to default: Only Admin and Stock (52 ingredients, 0 stock)
    try {
      const resetCheck = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM activity_logs WHERE aksi = 'DEFAULT_ADMIN_AND_STOCK_V1';"
      );
      if (!resetCheck || resetCheck.count === 0) {
        console.log('[DB] Executing reset to default: only Admin and 52 Stock ingredients...');
        await db.execAsync('PRAGMA foreign_keys = OFF;');
        await db.runAsync('DELETE FROM transaction_items;');
        await db.runAsync('DELETE FROM transactions;');
        await db.runAsync('DELETE FROM shifts;');
        await db.runAsync('DELETE FROM expenses;');
        await db.runAsync('DELETE FROM recipes;');
        await db.runAsync('DELETE FROM menu_variants;');
        await db.runAsync('DELETE FROM menu_items;');
        await db.runAsync('DELETE FROM stock_movements;');
        await db.runAsync("DELETE FROM users WHERE role != 'owner';");
        await db.runAsync('UPDATE ingredients SET stok_saat_ini = 0;');
        await db.execAsync('PRAGMA foreign_keys = ON;');

        // Check if 52 stock ingredients exist; if empty, insert from seed
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

        // Ensure default Owner exists so login is always accessible
        const ownerExists = await db.getFirstAsync<{ count: number }>(
          "SELECT COUNT(*) as count FROM users WHERE role = 'owner';"
        );
        if (!ownerExists || ownerExists.count === 0) {
          const ownerPinHash = await hashPin('123456');
          await db.runAsync(
            "INSERT INTO users (nama, pin_hash, role, status_aktif, created_at) VALUES ('Admin / Owner', ?, 'owner', 1, datetime('now'));",
            [ownerPinHash]
          );
        }

        await db.runAsync(
          "INSERT INTO activity_logs (user_id, aksi, detail, timestamp) VALUES (1, 'DEFAULT_ADMIN_AND_STOCK_V1', 'Database di-reset ke default: Hanya Akun Admin dan 52 Stok Bahan Baku dipertahankan.', datetime('now'));"
        );
        console.log('[DB] Reset to default completed successfully! Admin and 52 stock items are ready.');
      }
    } catch (e) {
      console.warn('[DB] Default reset check skipped:', e);
    }

    // Ensure default app_settings exists
    try {
      const settingsCount = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM app_settings;'
      );
      if (!settingsCount || settingsCount.count === 0) {
        await db.runAsync(`
          INSERT INTO app_settings (id, nama_toko, nama_cabang, alamat_toko, telepon_toko, footer_struk, enable_tax, tax_percentage, service_charge)
          VALUES (1, 'Lette Roti Bakar', 'Cabang 1', 'Jl. Merdeka No. 10', '0812-3456-7890', 'Terima kasih atas kunjungan Anda!', 0, 10, 0);
        `);
      }
    } catch (e) {
      console.warn('[DB] Settings check skipped:', e);
    }

    // Ensure default category always exists to prevent foreign key errors on menu_items
    try {
      const catCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM menu_categories;');
      if (!catCount || catCount.count === 0) {
        await db.runAsync("INSERT OR IGNORE INTO menu_categories (id, nama) VALUES (1, 'Menu Utama');");
      }
    } catch {}

    // Check if users table is empty; if so, run initial seeder
    try {
      const userCountResult = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) as count FROM users;'
      );

      if (!userCountResult || userCountResult.count === 0) {
        console.log('[DB] Seeding initial database data (users, default categories, 0 stock items)...');
        const seed = await getSeedData();

        // 1. Seed Users
        for (const user of seed.users) {
          await db.runAsync(
            `INSERT OR IGNORE INTO users (nama, pin_hash, role, status_aktif, created_at) VALUES (?, ?, ?, ?, ?);`,
            [user.nama, user.pin_hash, user.role, user.status_aktif, user.created_at]
          );
        }

        // 2. Seed Categories
        for (const cat of seed.categories) {
          await db.runAsync(
            `INSERT OR IGNORE INTO menu_categories (nama) VALUES (?);`,
            [cat.nama]
          );
        }

        // 3. Seed Ingredients (Empty by default: 0 items)
        for (const ing of seed.ingredients) {
          const result = await db.runAsync(
            `INSERT INTO ingredients (nama, satuan, harga_beli_satuan, stok_saat_ini, stok_minimum, urutan) VALUES (?, ?, ?, ?, ?, ?);`,
            [ing.nama, ing.satuan, ing.harga_beli_satuan || 0, ing.stok_saat_ini || 0, ing.stok_minimum || 0, ing.urutan || 0]
          );

          if (ing.stok_saat_ini > 0) {
            await db.runAsync(
              `INSERT INTO stock_movements (ingredient_id, tipe, jumlah, tanggal, keterangan, sumber) VALUES (?, ?, ?, ?, ?, ?);`,
              [result.lastInsertRowId, 'masuk', ing.stok_saat_ini, seed.timestamp, 'Stok Awal Sistem', 'Inisialisasi']
            );
          }
        }

        // 4. Activity Log (dynamically fetch existing user id to satisfy FK)
        const firstUser = await db.getFirstAsync<{ id: number }>('SELECT id FROM users LIMIT 1;');
        const safeUserId = firstUser ? firstUser.id : 1;
        await db.runAsync(
          `INSERT INTO activity_logs (user_id, aksi, detail, timestamp) VALUES (?, ?, ?, ?);`,
          [safeUserId, 'INIT_DATABASE', 'Inisialisasi database bersih (0 stok, 0 menu, 0 transaksi)', seed.timestamp]
        );

        console.log('[DB] Seeding completed successfully! Menu & stock are 0 by default, ready for custom entry or desktop sync.');
      }
    } catch (seedErr) {
      console.warn('[DB] Seeding error (handled gracefully):', seedErr);
    }

    // Safety check: ensure at least 1 category exists if empty
    try {
      const catCount = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM menu_categories;');
      if (!catCount || catCount.count === 0) {
        await db.runAsync('INSERT INTO menu_categories (nama) VALUES (?);', ['Menu Utama']);
      }
    } catch {}

    isDbInitialized = true;
  })().catch((err) => {
    initPromise = null;
    isDbInitialized = false;
    throw err;
  });

  return initPromise;
}

/**
 * Completely resets/deletes the local SQLite database file on disk.
 * Used for automatic self-healing or when the user triggers a repair from the error screen.
 */
export async function resetDatabaseFile(): Promise<void> {
  try {
    if (dbPromise) {
      const db = await dbPromise.catch(() => null);
      if (db) {
        try {
          await db.closeAsync();
        } catch {}
      }
    }
    dbPromise = null;
    initPromise = null;
    isDbInitialized = false;
    await SQLite.deleteDatabaseAsync('lette_kasir.db');
    console.log('[DB] Database file successfully deleted and reset.');
  } catch (err) {
    console.warn('[DB] Failed to delete database file:', err);
  }
}
