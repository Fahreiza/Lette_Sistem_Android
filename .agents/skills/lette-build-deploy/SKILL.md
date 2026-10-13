---
name: lette-build-deploy
description: Panduan prosedur verifikasi, kompilasi, dan build produksi Desktop Tauri serta APK Android Lette Kasir.
---

# Prosedur Build & Deployment Lette Kasir

Gunakan skill ini saat memverifikasi kode atau membangun rilis Desktop dan Android.

## 1. Verifikasi & Build Desktop Kasir (`Lette_Sistem`)

- **Cek Backend Rust:**
  ```powershell
  cd src-tauri
  cargo check
  ```

- **Build Frontend Web/Tauri:**
  ```powershell
  npm run build
  ```

- **Bundle Bridge Server Standalone (Node Fallback):**
  ```powershell
  npm run bundle:bridge
  ```

## 2. Verifikasi & Build Android Kasir (`Lette_Sistem_Android`)

- **Verifikasi TypeScript:**
  ```powershell
  npx tsc --noEmit
  ```

- **Build APK Rilis (Signed Release):**
  Pastikan `ANDROID_HOME` mengarah ke Android SDK lokal sebelum menjalankan Gradle:
  ```powershell
  cd android
  $env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
  .\gradlew.bat assembleRelease --no-daemon
  ```

- **Lokasi Output APK:**
  `android\app\build\outputs\apk\release\app-release.apk`
  Salin ke root proyek untuk kemudahan akses pengguna: `LetteKasir-v1.0.0-Release.apk`.
