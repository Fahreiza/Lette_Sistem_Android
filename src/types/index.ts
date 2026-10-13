export type UserRole = 'owner' | 'kasir';

export interface User {
  id: number;
  nama: string;
  pin_hash: string;
  role: UserRole;
  status_aktif: number; // 1 = aktif, 0 = nonaktif
  created_at: string;
}

export interface MenuCategory {
  id: number;
  nama: string;
}

export interface VariantIngredientEntry {
  ingredient_id: number;
  jumlah_terpakai: number;
}

export interface MasterVariant {
  id: number;
  nama_varian: string;
  harga_tambahan: number;
  harga_offline?: number;
  harga_gofood?: number;
  harga_shopeefood?: number;
  harga_grabfood?: number;
  kategori_varian?: string;
  ingredient_id?: number | null;
  jumlah_terpakai?: number;
  ingredient_nama?: string;
  ingredient_satuan?: string;
  ingredients_list?: VariantIngredientEntry[];
}

export interface MenuVariant {
  id?: number;
  menu_item_id?: number;
  nama_varian: string;
  harga_tambahan: number;
  harga_offline?: number;
  harga_gofood?: number;
  harga_shopeefood?: number;
  harga_grabfood?: number;
  master_variant_id?: number | null;
  ingredient_id?: number | null;
  jumlah_terpakai?: number;
  ingredient_nama?: string;
  ingredient_satuan?: string;
  ingredients_list?: VariantIngredientEntry[];
  kategori_varian?: string;
}

export function getVariantPriceForChannel(variant: MenuVariant, channel: OrderChannel): number {
  switch (channel) {
    case 'gofood':
      return variant.harga_gofood !== undefined && variant.harga_gofood !== null
        ? variant.harga_gofood
        : (variant.harga_offline ?? variant.harga_tambahan ?? 0);
    case 'shopeefood':
      return variant.harga_shopeefood !== undefined && variant.harga_shopeefood !== null
        ? variant.harga_shopeefood
        : (variant.harga_offline ?? variant.harga_tambahan ?? 0);
    case 'grabfood':
      return variant.harga_grabfood !== undefined && variant.harga_grabfood !== null
        ? variant.harga_grabfood
        : (variant.harga_offline ?? variant.harga_tambahan ?? 0);
    default:
      return variant.harga_offline ?? variant.harga_tambahan ?? 0;
  }
}

export interface MenuItem {
  id: number;
  category_id: number;
  category_name?: string;
  nama: string;
  harga_offline: number;
  harga_gofood: number;
  harga_shopeefood: number;
  harga_grabfood: number;
  status_tersedia: number; // 1 = tersedia, 0 = habis
  is_synced?: number; // 1 = sudah di-push ke PC, 0 = belum
  image_url?: string;
  variants?: MenuVariant[];
}

export interface Ingredient {
  id: number;
  nama: string;
  satuan: string; // 'pcs' | 'kg' | 'gr' | 'liter' | 'ml' | 'pack'
  harga_beli_satuan?: number;
  stok_saat_ini: number;
  stok_minimum: number;
  urutan?: number;
}

export interface Recipe {
  id: number;
  menu_item_id: number;
  ingredient_id: number;
  ingredient_name?: string;
  ingredient_unit?: string;
  jumlah_terpakai: number;
}

export type OrderChannel = 'offline' | 'gofood' | 'shopeefood' | 'grabfood';
export type PaymentMethod = 'tunai' | 'qris';
export type TransactionStatus = 'selesai' | 'void';

export interface TransactionItem {
  id?: number;
  transaction_id?: number;
  menu_item_id: number;
  menu_name?: string;
  variant_ids?: string;
  variant_names?: string;
  custom_notes?: string;
  qty: number;
  harga_satuan: number;
  subtotal: number;
}

export interface Transaction {
  id: number;
  uuid?: string;
  tanggal: string; // YYYY-MM-DD HH:mm:ss
  channel: OrderChannel;
  metode_bayar: PaymentMethod;
  subtotal?: number;
  tax_percentage?: number;
  tax_amount?: number;
  total: number;
  online_voucher_discount?: number;
  online_commission_amount?: number;
  online_net_amount?: number;
  uang_diterima?: number;
  kembalian?: number;
  status: TransactionStatus;
  kasir_id: number;
  kasir_name?: string;
  shift_id?: string;
  catatan?: string;
  alasan_void?: string;
  void_at?: string;
  is_synced?: number;
  desktop_order_id?: string;
  source?: string;
  items?: TransactionItem[];
  sumber_dana?: WalletType | 'laci_kasir_mobile';
}

export type StockMovementType = 'masuk' | 'keluar' | 'adjustment' | 'opname';

export interface StockMovement {
  id: number;
  ingredient_id: number;
  ingredient_name?: string;
  tipe: StockMovementType;
  jumlah: number;
  tanggal: string;
  keterangan: string;
  sumber: string;
}

export type ExpenseCategory =
  | 'Kasbon Karyawan'
  | 'Lembur'
  | 'Belanja Bahan Baku'
  | 'Operasional Lain'
  | 'Listrik & Gas'
  | 'Sewa & Kebersihan'
  | string;

export type WalletType = 'laci_kasir' | 'saldo_manager' | 'rekening_owner';

export interface WalletTransfer {
  id: string; // TRF-YYYYMMDD-XXXX
  tanggal: string;
  from_wallet: WalletType;
  to_wallet: WalletType;
  jumlah: number;
  keterangan?: string;
  actor_id: number;
  actor_nama?: string;
  created_at: string;
  is_synced?: number;
}

export interface BalanceAdjustmentLog {
  id: string; // ADJ-YYYYMMDD-XXXX
  tanggal: string;
  dompet: WalletType;
  saldo_sebelum: number;
  saldo_sesudah: number;
  selisih: number;
  alasan: string;
  actor_id: number;
  actor_nama?: string;
  created_at: string;
  is_synced?: number;
}

export interface Expense {
  id: number;
  tanggal: string;
  kategori: ExpenseCategory;
  jumlah: number;
  keterangan: string;
  input_by: number;
  input_by_name?: string;
  sumber_dana?: WalletType | 'laci_kasir_mobile';
  shift_id?: string;
  is_synced?: number;
  desktop_expense_id?: string;
}

export interface CashierShift {
  id: string; // SFT-YYYYMMDD-XXXX
  kasir_id: number;
  kasir_nama: string;
  waktu_buka: string;
  waktu_tutup?: string;
  modal_awal: number;
  saldo_shift_sebelumnya?: number;
  selisih_serah_terima?: number;
  catatan_serah_terima?: string;
  shift_sebelumnya_id?: string;
  total_penjualan_tunai?: number;
  total_penjualan_qris?: number;
  total_penjualan_online?: number;
  total_pengeluaran_kas?: number;
  total_sistem_tunai?: number;
  uang_fisik_aktual?: number;
  selisih?: number;
  catatan_closing?: string;
  status: 'open' | 'closed';
}

export interface AppSettings {
  nama_toko: string;
  nama_cabang: string;
  alamat_toko: string;
  telepon_toko: string;
  footer_struk: string;
  enable_tax: boolean;
  tax_percentage: number;
  service_charge: number;
  qris_merchant_name?: string;
  qris_nmid?: string;
  qris_image_url?: string;
  bridge_server_url?: string;
  device_id?: string;
  commission_shopee?: number;
  commission_grab?: number;
  commission_gofood?: number;
  fee_gofood?: number;
  saldo_awal_laci?: number;
  saldo_awal_manager?: number;
  saldo_awal_rekening?: number;
}

export interface ActivityLog {
  id: number;
  user_id: number;
  user_name?: string;
  aksi: string;
  detail: string;
  timestamp: string;
}

export interface CartItem {
  uid: string;
  menuItem: MenuItem;
  selectedVariants: MenuVariant[];
  customNotes?: string;
  qty: number;
  unitPrice: number;
  subtotal: number;
}

export interface SalesReportSummary {
  totalOmset: number;
  totalOmsetNet?: number;
  totalKomisiOnline?: number;
  totalVoucherOnline?: number;
  omsetOnlineNet?: number;
  totalTransaksi: number;
  omsetOffline: number;
  omsetGoFood: number;
  omsetShopeeFood: number;
  omsetGrabFood: number;
  totalTunai: number;
  totalQris: number;
  totalPengeluaran: number;
  estimasiLabaBersih: number;
  totalModalAwal?: number;
  arusKasBersih?: number;
  totalHpp?: number;
  labaKotor?: number;
  foodCostPercentage?: number;
}

export interface TopSellingItem {
  menu_item_id: number;
  menu_name: string;
  category_name: string;
  total_qty: number;
  total_sales: number;
}
