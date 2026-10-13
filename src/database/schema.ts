export const CREATE_TABLES_SQL = `
-- Table: users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  pin_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('owner', 'kasir')),
  status_aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

-- Table: menu_categories
CREATE TABLE IF NOT EXISTS menu_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL UNIQUE
);

-- Table: menu_items
CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL,
  nama TEXT NOT NULL,
  harga_offline REAL NOT NULL DEFAULT 0,
  harga_gofood REAL NOT NULL DEFAULT 0,
  harga_shopeefood REAL NOT NULL DEFAULT 0,
  harga_grabfood REAL NOT NULL DEFAULT 0,
  status_tersedia INTEGER NOT NULL DEFAULT 1,
  is_synced INTEGER NOT NULL DEFAULT 1,
  image_url TEXT,
  FOREIGN KEY (category_id) REFERENCES menu_categories (id)
);

-- Table: master_variants
CREATE TABLE IF NOT EXISTS master_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama_varian TEXT NOT NULL,
  harga_tambahan REAL NOT NULL DEFAULT 0,
  harga_offline REAL DEFAULT 0,
  harga_gofood REAL DEFAULT 0,
  harga_shopeefood REAL DEFAULT 0,
  harga_grabfood REAL DEFAULT 0,
  kategori_varian TEXT,
  ingredient_id INTEGER,
  jumlah_terpakai REAL DEFAULT 0,
  ingredients_list TEXT
);

-- Table: menu_variants
CREATE TABLE IF NOT EXISTS menu_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_item_id INTEGER NOT NULL,
  nama_varian TEXT NOT NULL,
  harga_tambahan REAL NOT NULL DEFAULT 0,
  harga_offline REAL DEFAULT 0,
  harga_gofood REAL DEFAULT 0,
  harga_shopeefood REAL DEFAULT 0,
  harga_grabfood REAL DEFAULT 0,
  master_variant_id INTEGER,
  ingredient_id INTEGER,
  jumlah_terpakai REAL DEFAULT 0,
  ingredients_list TEXT,
  kategori_varian TEXT,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items (id) ON DELETE CASCADE
);

-- Table: ingredients
CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  satuan TEXT NOT NULL,
  harga_beli_satuan REAL NOT NULL DEFAULT 0,
  stok_saat_ini REAL NOT NULL DEFAULT 0,
  stok_minimum REAL NOT NULL DEFAULT 0,
  urutan INTEGER NOT NULL DEFAULT 0
);

-- Table: recipes
CREATE TABLE IF NOT EXISTS recipes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  menu_item_id INTEGER NOT NULL,
  ingredient_id INTEGER NOT NULL,
  jumlah_terpakai REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items (id) ON DELETE CASCADE,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients (id) ON DELETE CASCADE
);

-- Table: shifts
CREATE TABLE IF NOT EXISTS shifts (
  id TEXT PRIMARY KEY,
  kasir_id INTEGER NOT NULL,
  kasir_nama TEXT NOT NULL,
  waktu_buka TEXT NOT NULL,
  waktu_tutup TEXT,
  modal_awal REAL NOT NULL,
  saldo_shift_sebelumnya REAL DEFAULT 0,
  selisih_serah_terima REAL DEFAULT 0,
  catatan_serah_terima TEXT,
  shift_sebelumnya_id TEXT,
  total_penjualan_tunai REAL DEFAULT 0,
  total_penjualan_qris REAL DEFAULT 0,
  total_penjualan_online REAL DEFAULT 0,
  total_pengeluaran_kas REAL DEFAULT 0,
  total_sistem_tunai REAL DEFAULT 0,
  uang_fisik_aktual REAL DEFAULT 0,
  selisih REAL DEFAULT 0,
  catatan_closing TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  FOREIGN KEY (kasir_id) REFERENCES users (id)
);

-- Table: transactions
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT,
  tanggal TEXT NOT NULL,
  channel TEXT NOT NULL,
  metode_bayar TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  tax_percentage REAL NOT NULL DEFAULT 0,
  tax_amount REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL,
  online_voucher_discount REAL NOT NULL DEFAULT 0,
  online_commission_amount REAL NOT NULL DEFAULT 0,
  online_net_amount REAL NOT NULL DEFAULT 0,
  uang_diterima REAL NOT NULL DEFAULT 0,
  kembalian REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'selesai',
  kasir_id INTEGER NOT NULL,
  shift_id TEXT,
  catatan TEXT,
  alasan_void TEXT,
  void_at TEXT,
  is_synced INTEGER NOT NULL DEFAULT 0,
  desktop_order_id TEXT,
  source TEXT,
  sumber_dana TEXT NOT NULL DEFAULT 'laci_kasir',
  FOREIGN KEY (kasir_id) REFERENCES users (id),
  FOREIGN KEY (shift_id) REFERENCES shifts (id)
);

-- Table: transaction_items
CREATE TABLE IF NOT EXISTS transaction_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL,
  menu_item_id INTEGER NOT NULL,
  menu_name TEXT,
  variant_ids TEXT,
  custom_notes TEXT,
  qty INTEGER NOT NULL,
  harga_satuan REAL NOT NULL,
  subtotal REAL NOT NULL,
  FOREIGN KEY (transaction_id) REFERENCES transactions (id) ON DELETE CASCADE,
  FOREIGN KEY (menu_item_id) REFERENCES menu_items (id)
);

-- Table: deleted_expenses (tracks offline deleted expenses so they push to desktop and don't resurrect)
CREATE TABLE IF NOT EXISTS deleted_expenses (
  id INTEGER PRIMARY KEY,
  deleted_at TEXT NOT NULL
);

-- Table: deleted_menu_items (tracks offline deleted menu items so they push to desktop and don't resurrect)
CREATE TABLE IF NOT EXISTS deleted_menu_items (
  id INTEGER PRIMARY KEY,
  nama TEXT,
  deleted_at TEXT NOT NULL
);

-- Table: deleted_users (tracks deleted employees/users so they push to desktop and don't resurrect)
CREATE TABLE IF NOT EXISTS deleted_users (
  id INTEGER PRIMARY KEY,
  nama TEXT,
  deleted_at TEXT NOT NULL
);

-- Table: stock_movements
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ingredient_id INTEGER NOT NULL,
  tipe TEXT NOT NULL,
  jumlah REAL NOT NULL,
  tanggal TEXT NOT NULL,
  keterangan TEXT,
  sumber TEXT,
  is_synced INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (ingredient_id) REFERENCES ingredients (id)
);

-- Table: expenses
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tanggal TEXT NOT NULL,
  kategori TEXT NOT NULL,
  jumlah REAL NOT NULL,
  keterangan TEXT,
  input_by INTEGER NOT NULL,
  sumber_dana TEXT NOT NULL DEFAULT 'laci_kasir',
  shift_id TEXT,
  is_synced INTEGER NOT NULL DEFAULT 0,
  desktop_expense_id TEXT,
  FOREIGN KEY (input_by) REFERENCES users (id)
);

-- Table: wallet_transfers
CREATE TABLE IF NOT EXISTS wallet_transfers (
  id TEXT PRIMARY KEY,
  tanggal TEXT NOT NULL,
  from_wallet TEXT NOT NULL,
  to_wallet TEXT NOT NULL,
  jumlah REAL NOT NULL,
  keterangan TEXT,
  actor_id INTEGER NOT NULL DEFAULT 1,
  actor_nama TEXT,
  created_at TEXT NOT NULL,
  is_synced INTEGER NOT NULL DEFAULT 0
);

-- Table: balance_adjustments
CREATE TABLE IF NOT EXISTS balance_adjustments (
  id TEXT PRIMARY KEY,
  tanggal TEXT NOT NULL,
  dompet TEXT NOT NULL,
  saldo_sebelum REAL NOT NULL,
  saldo_sesudah REAL NOT NULL,
  selisih REAL NOT NULL,
  alasan TEXT,
  actor_id INTEGER NOT NULL DEFAULT 1,
  actor_nama TEXT,
  created_at TEXT NOT NULL,
  is_synced INTEGER NOT NULL DEFAULT 0
);

-- Table: app_settings
CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  nama_toko TEXT NOT NULL DEFAULT 'Lette Roti Bakar',
  nama_cabang TEXT NOT NULL DEFAULT 'Cabang 1',
  alamat_toko TEXT NOT NULL DEFAULT 'Jl. Merdeka No. 10',
  telepon_toko TEXT NOT NULL DEFAULT '0812-3456-7890',
  footer_struk TEXT NOT NULL DEFAULT 'Terima kasih atas kunjungan Anda!',
  enable_tax INTEGER NOT NULL DEFAULT 0,
  tax_percentage REAL NOT NULL DEFAULT 10,
  service_charge REAL NOT NULL DEFAULT 0,
  qris_merchant_name TEXT,
  qris_nmid TEXT,
  qris_image_url TEXT,
  bridge_server_url TEXT,
  device_id TEXT,
  commission_shopee REAL NOT NULL DEFAULT 27.78,
  commission_grab REAL NOT NULL DEFAULT 25,
  commission_gofood REAL NOT NULL DEFAULT 20,
  fee_gofood REAL NOT NULL DEFAULT 1000,
  saldo_awal_laci REAL NOT NULL DEFAULT 0,
  saldo_awal_manager REAL NOT NULL DEFAULT 0,
  saldo_awal_rekening REAL NOT NULL DEFAULT 0
);

-- Table: activity_logs
CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  aksi TEXT NOT NULL,
  detail TEXT,
  timestamp TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id)
);
`;
