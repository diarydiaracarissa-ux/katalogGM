# Katalog Digital Jenis Kain — Gorden Magelang

Website katalog sampel kain gorden untuk **[www.gordenmagelang.web.id](https://www.gordenmagelang.web.id)** yang memungkinkan calon pembeli memilih sendiri jenis kain & kode warna dari **foto sampel asli resolusi penuh**, dilengkapi **Menu Admin pembaca label foto otomatis (OCR & AI Vision)** serta integrasi **Google Drive + Vercel**.

## Fitur Utama

1. **Katalog Sampel Kain Asli (Foto Jelas & Zoom HD 350%)**
   - Foto buku sampel kain disimpan utuh tanpa kompresi agar serat tenunan, motif, warna asli, dan label spesifikasi terlihat sangat tajam.
   - Sudah dimuat 2 foto sampel asli koleksi **NIGHT BLOCK** (`NB-03A FROST` & `NB-07A STERLING`, `100% Blackout`, `30% Linen 70% Polyester`, `Width 320 cm`, `Weight 260 Gsm/sq.Mtr`).

2. **Pembeli Bisa Pilih Sendiri Kode Kain & Kirim via WhatsApp**
   - Filter berdasarkan **Koleksi** (`NIGHT BLOCK`, dll.), **Kategori/Shading** (`Blackout 100%`, `Dimout`, `Vitrase`, `Linen`, `Jacquard`), atau cari cepat berdasarkan **Kode Kain** (`NB-03A`, `NB-07A`).
   - Tombol **`+ Pilih Kain`** di setiap kartu akan mengumpulkan kode-kode kain pilihan pelanggan di bar bawah, lalu bisa disalin atau langsung dikirim ke WhatsApp Gorden Magelang.

3. **Membaca Nama Kain, Kode Warna & Spesifikasi Langsung dari Foto**
   - **OCR Label Reader (Tesseract.js — Gratis tanpa API Key)**: otomatis membaca teks label tercetak pada foto (`Collection`, `Color / Code`, `Shading Degree`, `Composition`, `Width`, `Weight`, `Brand`, `Fire Retardant`).
   - **AI Vision Pro (Opsional — Gemini API)**: analisis foto lebih akurat lagi jika Admin mengatur `GEMINI_API_KEY`.

4. **Siap Deploy ke Vercel + Penyimpanan Foto Google Drive**
   - Terhubung ke folder Google Drive: `https://drive.google.com/drive/folders/1W8wTEg03Aqiv-rJHvoFngwYpg1u-Hjlw`
   - Dilengkapi [google-apps-script/DriveCatalogBridge.gs](google-apps-script/DriveCatalogBridge.gs) agar upload foto dari Menu Admin di **Vercel** langsung tersimpan permanen ke folder Google Drive Anda (100% gratis, tanpa biaya database/storage).

---

## Cara Deploy ke Vercel + Google Drive

1. **Bagikan Folder Google Drive** `1W8wTEg03Aqiv-rJHvoFngwYpg1u-Hjlw` dengan akses **“Siapa saja yang memiliki link — Pelihat”**.
2. **Pasang Bridge Google Drive (1 Menit)**:
   - Buka [script.google.com](https://script.google.com) → **Project Baru**.
   - Salin seluruh isi file `google-apps-script/DriveCatalogBridge.gs` dan paste ke editor.
   - Klik **Deploy → New deployment → Web app** (*Execute as: Me*, *Who has access: Anyone*).
   - Salin **Web app URL** hasil deploy.
3. **Deploy Folder Proyek ke Vercel**:
   - Push folder `katalog-gorden-studio` ke GitHub (atau jalankan `npx vercel --prod`).
   - Di Dashboard Vercel → **Settings → Environment Variables**, tambahkan:
     - `GAS_BRIDGE_URL` = Web app URL dari langkah 2
     - `GOOGLE_DRIVE_FOLDER_ID` = `1W8wTEg03Aqiv-rJHvoFngwYpg1u-Hjlw`
     - `GEMINI_API_KEY` = *(opsional, jika ingin AI Vision Pro)*

## Menjalankan Lokal

```powershell
cd C:\Users\prayo\.gemini\antigravity\scratch\katalog-gorden-studio
npm start
```

Buka **`http://127.0.0.1:3456`** (PIN Admin default: `1234`).
