# PinjamAlat V2 (Aplikasi Peminjaman Alat & Inventaris Bahan Praktik)

Aplikasi berbasis web (Progressive Web App - PWA) untuk manajemen inventaris alat, peminjaman alat, serta pendataan keluar/masuk bahan praktik secara real-time. Aplikasi ini terintegrasi menggunakan Google Apps Script (GAS) dan Google Sheets sebagai database _backend_ yang menjamin data tersinkronisasi mulus.

## Gambaran Fitur Utama
- **Dashboard Interaktif**: Melihat statistik ketersediaan alat, peminjaman aktif teratas, dan status bahan praktik yang kritis.
- **Support Offline (PWA)**: Aplikasi dapat di-install dan diakses secara luring. Data akan otomatis melakukan antrean (queue) dan diselaraskan ke database bila jaringan kembali aktif (Sync to Server).
- **Manajemen Role**: Memiliki hak akses terpusat untuk Admin, serta hak terbatas untuk Guru dan Toolman yang terisolasi berdasarkan Jurusan masing-masing.
- **Cetak Struk Transaksi**: Cetak bukti peminjaman terintegrasi dengan Barcode untuk efisiensi transaksi fisik.
- **Ekspor Riwayat**: Memungkinkan Toolman/Admin untuk mengekspor status peminjaman maupun stok bahan praktik langsung ke format PDF atau CSV.
- **Lampiran Gambar**: Alat pendukung dapat diunggah dengan foto real-time untuk visualisasi.

## Struktur Database (Google Sheets)
Aplikasi ini membaca dan merekam ke berbagai sheet dokumen Google Spreadsheet, terdiri atas sheet:
1. `Alat` : Master stok inventaris alat.
2. `Peminjaman` : Riwayat form peminjaman alat oleh pengguna.
3. `Users` : Autentikasi Pengguna & penugasan Jurusan.
4. `Kategori` : Klasifikasi tipe alat & bahan praktik berdasarkan Jurusan.
5. `Jurusan` : Konfigurasi daftar master Jurusan.
6. `Bahan` : Master stok inventaris bahan praktik.
7. `Bahan_Keluar` : History pemakaian harian bahan praktik.

## Panduan Deployment ke GitHub Pages

Apabila Anda berencana menghosting (mempublikasikan) web ini di internet secara mandiri menggunakan **GitHub Pages**, silakan ikuti langkah-langkah di bawah ini:

### 1. Inisialisasi Repositori
1. Pastikan Anda mempunyai akun [GitHub](https://github.com/).
2. Buat repositori baru (New Repository) dengan nama sesuai keinginan, contoh: `SistemInventorySMK`. Atur ke **Public**.
3. _Upload_ / sisipkan/ *push* semua file ke repositori yang baru Anda buat, di antaranya: 
   `index.html`, `app-v3.js`, `db.js`, `style-v3.css`, `Code.js`, `manifest.json`, `sw.js` (dan seluruh file ikutan semacam logo, icon, dll).
4. Jangan ikutsertakan folder IDE atau sistem Anda. (Gunakan `.gitignore` yang sudah disertakan).

### 2. Mengaktifkan GitHub Pages
1. Pergi ke halaman repositori GitHub Anda.
2. Buka menu tab **Settings > Pages > Build and deployment**.
3. Di bagian "Source", pilih **Deploy from a branch**.
4. Di bagian "Branch", pilih `main` atau `master`, lalu klik **Save**.
5. Tunggu sekitar 1-5 menit. GitHub Pages otomatis akan menampilkan tautan *live* seperti: `https://[username_github_kamu].github.io/[nama_repository]/`.

### 3. Konfigurasi Backend (Google Apps Script)
1. Buka Google Sheets yang sedang Anda gunakan sebagai database dan akses menu **Ekstensi > Apps Script**.
2. Salin isi seluruh kode pada file `Code.js` di dalam folder ini lalu lekatkan pada project *Apps Script* Anda (biasanya `Kode.gs`).
3. Tekan **Terapkan (Deploy) > Deployment baru (New Deployment)**.
4. Pastikan disetel sebagai **"Aplikasi Web" (Web App)**.
   - Eksekusi sebagai: `Saya (Alamat email Anda)`
   - Siapa yang memiliki akses: `Siapa saja (Anyone)`
5. Klik **Terapkan (Deploy)**. Akan muncul link yang diakhiri oleh `/exec`.
6. Tautan inilah yang merupakan URL Endpoint Anda.
7. Jika link API baru atau Anda harus mengalokasikannya ke hosting baru:
   Buka file `db.js`, cari variabel konstan `API_URL`, lalu masukkan alamat Apps Script `exec` Anda ke dalamnya.

### 4. Info Progressive Web App (PWA)
Aplikasi PWA membutuhkan koneksi internet berstandar proteksi HTTPS (yang mana sudah terpenuhi secara default karena URL dari GitHub adalah menggunakan sertifikat HTTPS standard). Pastikan logo dan seluruh ukuran ikon di `manifest.json` sinkron dengan direktori direktori file *image*.

## Pengembangan Lanjutan (Development)
1. Edit *layout* maupun komponen antarmuka GUI pada `index.html` (ditopang oleh CSS `style-v3.css`).
2. Fungsionalitas data lokal dan offline storage dilayani oleh `db.js` (dengan *library localForage*).
3. Seluruh *state logic*, filter tabel, cetak, navigasi panel diselesaikan pada *controller file* `app-v3.js`.
