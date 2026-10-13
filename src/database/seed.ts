import { hashPin } from '../utils/crypto';
import { formatCurrentTimestamp } from '../utils/formatters';

export interface DefaultIngredientDef {
  no: number;
  nama: string;
  satuan: string;
  harga_beli_satuan: number;
  stok_saat_ini: number;
  stok_minimum: number;
}

export const EXCEL_STOCK_ITEMS_52: DefaultIngredientDef[] = [
  { no: 1, nama: "Roti", satuan: "pcs", harga_beli_satuan: 4000, stok_saat_ini: 0, stok_minimum: 200 },
  { no: 2, nama: "Mentega", satuan: "gram", harga_beli_satuan: 20.5, stok_saat_ini: 0, stok_minimum: 6000 },
  { no: 3, nama: "Skm", satuan: "gram", harga_beli_satuan: 23, stok_saat_ini: 0, stok_minimum: 2500 },
  { no: 4, nama: "Coklat", satuan: "gram", harga_beli_satuan: 50, stok_saat_ini: 0, stok_minimum: 5000 },
  { no: 5, nama: "Tiramisu", satuan: "gram", harga_beli_satuan: 50, stok_saat_ini: 0, stok_minimum: 1000 },
  { no: 6, nama: "Keju", satuan: "gram", harga_beli_satuan: 43.75, stok_saat_ini: 0, stok_minimum: 4000 },
  { no: 7, nama: "Greentea", satuan: "gram", harga_beli_satuan: 50, stok_saat_ini: 0, stok_minimum: 500 },
  { no: 8, nama: "Strawberry", satuan: "gram", harga_beli_satuan: 50, stok_saat_ini: 0, stok_minimum: 500 },
  { no: 9, nama: "Red Velvet", satuan: "gram", harga_beli_satuan: 64, stok_saat_ini: 0, stok_minimum: 250 },
  { no: 10, nama: "Taro", satuan: "gram", harga_beli_satuan: 55, stok_saat_ini: 0, stok_minimum: 500 },
  { no: 11, nama: "Kacang", satuan: "gram", harga_beli_satuan: 30, stok_saat_ini: 0, stok_minimum: 500 },
  { no: 12, nama: "Almond", satuan: "gram", harga_beli_satuan: 124, stok_saat_ini: 0, stok_minimum: 250 },
  { no: 13, nama: "Choco cr", satuan: "gram", harga_beli_satuan: 55, stok_saat_ini: 0, stok_minimum: 1000 },
  { no: 14, nama: "Tiramisu cr", satuan: "gram", harga_beli_satuan: 55, stok_saat_ini: 0, stok_minimum: 1000 },
  { no: 15, nama: "Chese Cr", satuan: "gram", harga_beli_satuan: 60, stok_saat_ini: 0, stok_minimum: 1000 },
  { no: 16, nama: "Greentea Cr", satuan: "gram", harga_beli_satuan: 160, stok_saat_ini: 0, stok_minimum: 1000 },
  { no: 17, nama: "Gula", satuan: "gram", harga_beli_satuan: 17, stok_saat_ini: 0, stok_minimum: 1000 },
  { no: 18, nama: "Kopi", satuan: "gram", harga_beli_satuan: 149, stok_saat_ini: 0, stok_minimum: 380 },
  { no: 19, nama: "Telur", satuan: "pcs", harga_beli_satuan: 2000, stok_saat_ini: 0, stok_minimum: 16 },
  { no: 20, nama: "Mayo", satuan: "gram", harga_beli_satuan: 25, stok_saat_ini: 0, stok_minimum: 1000 },
  { no: 21, nama: "Lada", satuan: "gram", harga_beli_satuan: 0, stok_saat_ini: 0, stok_minimum: 0 },
  { no: 22, nama: "Penyedap rasa", satuan: "gram", harga_beli_satuan: 0, stok_saat_ini: 0, stok_minimum: 0 },
  { no: 23, nama: "Lemontea", satuan: "pcs", harga_beli_satuan: 1200, stok_saat_ini: 0, stok_minimum: 30 },
  { no: 24, nama: "thaitea", satuan: "pcs", harga_beli_satuan: 2400, stok_saat_ini: 0, stok_minimum: 10 },
  { no: 25, nama: "Green thaitea", satuan: "pcs", harga_beli_satuan: 2400, stok_saat_ini: 0, stok_minimum: 10 },
  { no: 26, nama: "Cappucino", satuan: "pcs", harga_beli_satuan: 2100, stok_saat_ini: 0, stok_minimum: 10 },
  { no: 27, nama: "Chocolate", satuan: "pcs", harga_beli_satuan: 2100, stok_saat_ini: 0, stok_minimum: 10 },
  { no: 28, nama: "Galon", satuan: "galon", harga_beli_satuan: 7000, stok_saat_ini: 0, stok_minimum: 2 },
  { no: 29, nama: "Box medium", satuan: "pcs", harga_beli_satuan: 280, stok_saat_ini: 0, stok_minimum: 100 },
  { no: 30, nama: "Box large", satuan: "pcs", harga_beli_satuan: 500, stok_saat_ini: 0, stok_minimum: 100 },
  { no: 31, nama: "Cup plastik", satuan: "pcs", harga_beli_satuan: 200, stok_saat_ini: 0, stok_minimum: 50 },
  { no: 32, nama: "Cup kertas", satuan: "pcs", harga_beli_satuan: 360, stok_saat_ini: 0, stok_minimum: 50 },
  { no: 33, nama: "Kresek kecil", satuan: "pack", harga_beli_satuan: 5000, stok_saat_ini: 0, stok_minimum: 2 },
  { no: 34, nama: "Kresek sedang", satuan: "pack", harga_beli_satuan: 7500, stok_saat_ini: 0, stok_minimum: 2 },
  { no: 35, nama: "Kresek besar", satuan: "pack", harga_beli_satuan: 7500, stok_saat_ini: 0, stok_minimum: 2 },
  { no: 36, nama: "Sedotan", satuan: "pack", harga_beli_satuan: 0, stok_saat_ini: 0, stok_minimum: 0 },
  { no: 37, nama: "Stiker", satuan: "pcs", harga_beli_satuan: 0, stok_saat_ini: 0, stok_minimum: 0 },
  { no: 38, nama: "Nota", satuan: "pcs", harga_beli_satuan: 0, stok_saat_ini: 0, stok_minimum: 0 },
  { no: 39, nama: "Tisu biasa", satuan: "pack", harga_beli_satuan: 7000, stok_saat_ini: 0, stok_minimum: 2 },
  { no: 40, nama: "Tisu serbaguna", satuan: "pack", harga_beli_satuan: 7000, stok_saat_ini: 0, stok_minimum: 2 },
  { no: 41, nama: "Kertas bungkus", satuan: "lembar", harga_beli_satuan: 125, stok_saat_ini: 0, stok_minimum: 200 },
  { no: 42, nama: "Selotipe", satuan: "roll", harga_beli_satuan: 4000, stok_saat_ini: 0, stok_minimum: 2 },
  { no: 43, nama: "Gas", satuan: "tabung", harga_beli_satuan: 20000, stok_saat_ini: 0, stok_minimum: 1 },
  { no: 44, nama: "Sunligt", satuan: "pcs", harga_beli_satuan: 2000, stok_saat_ini: 0, stok_minimum: 5 },
  { no: 45, nama: "Detergent", satuan: "pcs", harga_beli_satuan: 1000, stok_saat_ini: 0, stok_minimum: 5 },
  { no: 46, nama: "Soklin lantai", satuan: "pcs", harga_beli_satuan: 0, stok_saat_ini: 0, stok_minimum: 0 },
  { no: 47, nama: "Parsley", satuan: "pcs", harga_beli_satuan: 0, stok_saat_ini: 0, stok_minimum: 0 },
  { no: 48, nama: "rougut", satuan: "pcs", harga_beli_satuan: 25000, stok_saat_ini: 0, stok_minimum: 1 },
  { no: 49, nama: "cleo mineral", satuan: "botol", harga_beli_satuan: 1800, stok_saat_ini: 0, stok_minimum: 24 },
  { no: 50, nama: "Nutrisari Jeruk", satuan: "sachet", harga_beli_satuan: 1300, stok_saat_ini: 0, stok_minimum: 10 },
  { no: 51, nama: "Teh", satuan: "pcs", harga_beli_satuan: 0, stok_saat_ini: 0, stok_minimum: 0 },
  { no: 52, nama: "Saos", satuan: "pcs", harga_beli_satuan: 0, stok_saat_ini: 0, stok_minimum: 0 },
];

export async function getSeedData() {
  const timestamp = formatCurrentTimestamp();
  
  // Hash Default Owner PIN
  const ownerPinHash = await hashPin('123456');

  // Default: Cashiers are 0 (Only 1 default Admin / Owner account)
  const users = [
    { nama: 'Owner', pin_hash: ownerPinHash, role: 'owner', status_aktif: 1, created_at: timestamp },
  ];

  const categories = [
    { nama: 'Menu Utama' },
  ];

  // Default: 52 Stock Ingredients (Stok Awal 0)
  const ingredients = EXCEL_STOCK_ITEMS_52.map(item => ({
    nama: item.nama,
    satuan: item.satuan,
    harga_beli_satuan: item.harga_beli_satuan,
    stok_saat_ini: 0,
    stok_minimum: item.stok_minimum,
    urutan: item.no,
  }));

  return { users, categories, ingredients, timestamp };
}
