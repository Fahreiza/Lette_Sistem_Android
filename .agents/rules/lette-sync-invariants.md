# Invarian Sinkronisasi Dua Arah Lette Kasir (Desktop & Android)

Setiap pengembangan atau modifikasi kode pada sistem Desktop Kasir (`Lette_Sistem`) dan HP Kasir (`Lette_Sistem_Android`) WAJIB mematuhi 7 invarian sinkronisasi berikut:

## 1. Modul Menu & Resep
- Sinkronisasi dua arah meliputi: Kategori, Harga (Offline & Online Food), Varian, dan Resep Bahan Baku.
- Penghapusan menu di Android dikelola oleh `menuService.deleteMenuItem` (jangan menambahkan pemanggilan API `deleteMenuItemOnDesktop` kedua yang memicu duplikasi).

## 2. Modul Kasir & POS
- Pencocokan transaksi wajib universal memeriksa `id`, `localTransactionId`, dan `desktopOrderId`.
- Aksi Void wajib mengembalikan stok bahan baku di kedua perangkat secara realtime.
- Batas antrean aktif minimal 500 transaksi.

## 3. Modul Stok Bahan Baku
- Belanja stok bahan baku (`STOCK_PURCHASED`) TIDAK BOLEH memanggil `sqliteEngine.addExpense` di sisi desktop secara otomatis. Seluruh pengeluaran harus mengalir eksklusif lewat kanal sinkronisasi pengeluaran (`/api/sync/expense`) untuk menghindari duplikasi biaya.
- Penyesuaian stok opname dari HP tidak boleh menimpa master data bahan Desktop.

## 4. Modul Pengeluaran (Expenses)
- Jangan pernah melakukan penghapusan massal data pengeluaran lokal (`DELETE FROM expenses WHERE is_synced = 1`) saat sinkronisasi, karena Desktop hanya mengembalikan data terbaru (capped 500 items).
- Penghapusan pengeluaran hanya boleh terjadi melalui event resmi `EXPENSE_DELETED` dan `deleted_expenses`.

## 5. Modul Manajemen Karyawan (Users)
- Tambah, ubah data (nama, role, PIN), dan status aktif karyawan di Android wajib dikirim ke Desktop via `POST /api/sync/users`.
- Desktop wajib meng-upsert data user dan menyiarkan event `USERS_UPDATED`.

## 6. Modul Log Aktivitas (Audit Sensitif)
- Semua aksi sensitif (login, void, opname, perubahan karyawan) wajib disinkronkan via `GET/POST /api/sync/logs` dan event WebSocket `NEW_ACTIVITY_LOG`.

## 7. Reset di Manajemen Data
- Baik di Desktop (`SettingsPage.tsx`) maupun di Android (`DataManagementScreen.tsx`), jika mendeteksi koneksi aktif antarperangkat, WAJIB menampilkan dialog konfirmasi dengan 3 pilihan:
  1. "Ya, Reset Semua Perangkat" (Reset lokal + pemicuan reset remote)
  2. "Hanya Perangkat Ini" (Reset lokal saja)
  3. "Batal"
