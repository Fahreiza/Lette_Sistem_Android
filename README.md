# 🥖 Lette Sistem Android (Lette Kasir)

Aplikasi Kasir (Point of Sale / POS) modern berbasis **React Native** & **Expo SDK 52+** dengan penyimpanan database lokal **SQLite (expo-sqlite)**. Dilengkapi fitur manajemen transaksi, manajemen resep & inventaris stok otomatis, printer thermal Bluetooth (ESC/POS), laporan keuangan/shift, serta sinkronisasi lokal dengan **Lette Sistem Desktop**.

---

## 🚀 Fitur Utama

- **Point of Sale (POS) Cepat**: Antarmuka kasir responsif dengan varian menu, opsi takeaway/dine-in, diskon, dan catatan pesanan.
- **Dukungan Multi-Metode Pembayaran**: Tunai (Cash), Transfer Bank, dan QRIS statis/dinamis.
- **Thermal Printer Bluetooth (ESC/POS)**: Cetak struk otomatis & uji koneksi printer ukuran 58mm / 80mm via Bluetooth.
- **Inventaris & Resep Otomatis**: Pengurangan stok bahan baku otomatis saat menu terjual (BOM / Recipe Management).
- **Manajemen Shift Kasir**: Modal awal kas, pelaporan kas masuk/keluar, dan rekonsiliasi kas saat tutup shift.
- **Sinkronisasi Desktop (Local LAN / QR Pairing)**: Sinkronisasi data dua arah antara aplikasi Android kasir dan Lette Sistem Desktop (Tauri/PC) tanpa koneksi internet luar.
- **Penyimpanan Offline-First**: Seluruh transaksi dan master data tersimpan lokal dengan SQLite dan dapat beroperasi 100% offline.
- **Laporan & Ekspor Data**: Laporan omset, laba, menu terlaris, dan ekspor laporan ke format Excel (`.xlsx`).

---

## 📋 Prasyarat Sistem (Prerequisites)

Sebelum menjalankan atau meng-clone repository ini, pastikan komputer Anda telah terinstal:

1. **[Node.js](https://nodejs.org/)** (Rekomendasi versi LTS 18.x atau 20.x+)
2. **npm** (bawaan Node.js) atau **yarn**
3. **Git**
4. **Android Studio & JDK 17** *(Opsional, hanya jika ingin menjalankan di Android Emulator atau build APK native secara lokal)*
5. **Aplikasi Expo Go** *(Dapat diunduh di Google Play Store untuk pengujian di perangkat HP langsung)*

---

## 🛠️ Panduan Instalasi (Cara Menjalankan Setelah Clone)

Ikuti langkah-langkah berikut untuk meng-clone dan menjalankan project di komputer Anda:

### 1. Clone Repository
Buka terminal / command prompt dan jalankan:
```bash
git clone https://github.com/Fahreiza/Lette_Sistem_Android.git
cd Lette_Sistem_Android
```

### 2. Install Dependencies
Jalankan perintah instalasi paket:
```bash
npm install
```
> **Catatan Penting**: Perintah `npm install` akan otomatis mengeksekusi `patch-package` (`npm run postinstall`) untuk menerapkan patch driver Bluetooth Thermal Printer (`@vardrz/react-native-bluetooth-escpos-printer`).

---

## 📱 Menjalankan Aplikasi (Development Mode)

### Opsi A: Menggunakan Expo Dev Server
```bash
npx expo start
```
atau:
```bash
npm start
```

Setelah server Expo berjalan:
- **Di HP Asli**: Buka aplikasi **Expo Go** di Android, lalu scan QR Code yang muncul di terminal (pastikan HP dan laptop terhubung di Wi-Fi yang sama).
- **Di Android Emulator**: Tekan tombol `a` di terminal.
- **Clear Cache** (jika ada kendala cache): Jalankan `npx expo start -c`.

### Opsi B: Menggunakan Native Development Build
Karena project ini menggunakan modul native Bluetooth printer, disarankan menggunakan development build jika ingin menguji fitur cetak Bluetooth:
```bash
npx expo run:android
```

---

## 🔑 Akun Login Default (Data Awal / Seed)

Database lokal SQLite otomatis melakukan inisialisasi data default saat aplikasi pertama kali dijalankan:

| Akun / Role | PIN Default |
| :--- | :--- |
| **Owner (Admin)** | `123456` |

> PIN dan nama pengguna dapat diubah di menu **Pengaturan / Kelola Karyawan** setelah Anda login sebagai Owner.

---

## 📦 Panduan Build APK Rilis (Production APK)

### Cara 1: Build Native Lokal (Gradle)
Jika Anda memiliki Android Studio dan Android SDK terinstal di laptop:

1. Pastikan folder native Android sudah dibuat:
   ```bash
   npx expo prebuild
   ```
2. Jalankan build rilis via Gradle:
   ```bash
   cd android
   # Windows PowerShell:
   $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
   .\gradlew.bat assembleRelease --no-daemon
   ```
3. File APK yang dihasilkan akan berada di:
   ```text
   android/app/build/outputs/apk/release/app-release.apk
   ```

### Cara 2: Build Cloud via EAS (Expo Application Services)
1. Install EAS CLI: `npm install -g eas-cli`
2. Login ke akun Expo: `eas login`
3. Konfigurasi build APK:
   ```bash
   eas build -p android --profile preview
   ```

---

## 🗂️ Struktur Folder Utama

```text
Lette_Sistem_Android/
├── assets/                  # Ikon, splash screen, dan logo
├── patches/                 # File patch-package (native bluetooth printer)
├── src/
│   ├── components/          # Komponen UI modular (Modal, Keypad, Header, dll)
│   │   ├── common/          # Komponen umum (Toast, Keypad, Header)
│   │   ├── menu/            # Komponen resep & varian menu
│   │   ├── pos/             # Komponen kasir (Payment, QRIS, Struk)
│   │   ├── printer/         # Modal pengaturan printer bluetooth
│   │   ├── shift/           # Modal buka & tutup shift kasir
│   │   ├── stock/           # Modal restock & bahan baku
│   │   └── sync/            # Modal pairing desktop QR
│   ├── database/            # SQLite schema, migrasi, dan seed data awal
│   ├── navigation/          # React Navigation (Root, Tabs, Stacks)
│   ├── screens/             # Halaman layar aplikasi (POS, Menu, Stok, Lap, dll)
│   ├── services/            # Logika bisnis & query database (CRUD)
│   ├── stores/              # State management global (Zustand)
│   ├── types/               # Definisi TypeScript interface & types
│   └── utils/               # Formatters rupiah, enkripsi PIN, category theme
├── app.json                 # Konfigurasi Expo & Android package name
├── package.json             # Manifest dependensi & scripts
└── tsconfig.json            # Konfigurasi TypeScript
```

---

## 🤝 Kontribusi & Sinkronisasi Desktop
Aplikasi ini dirancang untuk bekerja secara mandiri maupun sinkron dengan **Lette Sistem Desktop (Tauri PC)**.
Untuk melakukan pairing sinkronisasi:
1. Hubungkan HP Android dan PC Kasir ke Wi-Fi / Hotspot yang sama.
2. Buka menu **Sinkronisasi Desktop** di Android.
3. Pindai kode QR yang ditampilkan pada aplikasi Desktop.

---

## 📄 Lisensi
Hak Cipta © 2026 Fahreiza & Tim Lette Sistem. Seluruh hak cipta dilindungi undang-undang.
