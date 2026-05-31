# Standar Operasional Prosedur (SOP) - ByteSuite ERP

Selamat datang di panduan penggunaan **ByteSuite ERP**. Dokumen ini dirancang untuk memandu pengguna dalam mengoperasikan modul-modul utama di dalam sistem. ByteSuite ERP dibangun untuk mensinkronisasi operasional bisnis mulai dari pembelian, manajemen gudang, produksi, hingga akuntansi keuangan (Jurnal, Buku Besar, dan Laba Rugi).

---

## 1. Modul Pengaturan & Master Data (Settings)
Modul ini adalah pusat kendali awal. Semua data harus didaftarkan di sini sebelum transaksi dapat dilakukan.

### A. Items (Barang & Bahan)
* **Kegunaan:** Mendaftarkan seluruh bahan baku (*Raw*), barang setengah jadi (*WIP*), kemasan (*Packaging*), hingga produk siap jual (*Finished Goods*).
* **Fitur Utama:**
  * **UOM Conversion:** Mengatur konversi satuan beli ke satuan resep (contoh: Beli dalam "KG", dipakai dalam "Gram").
  * **Disassembly Settings:** Khusus untuk bahan baku utuh (misal: Sapi Utuh) yang perlu dipecah menjadi komponen (Daging, Tulang) saat masuk gudang. 
  * **Reorder Level:** Batas minimal stok yang memicu peringatan restock.

### B. BOM (Bill of Materials / Resep)
* **Kegunaan:** Mendaftarkan resep atau formula produksi untuk barang jadi (*Finished Goods*) atau *WIP*.
* **Cara Kerja:** Anda menentukan berapa banyak bahan baku yang dibutuhkan untuk menghasilkan 1 unit barang jadi. BOM ini akan dipanggil secara otomatis oleh modul **Produksi**.

### C. Chart of Accounts (COA)
* **Kegunaan:** Mendaftarkan daftar akun akuntansi (Buku Besar).
* **Cara Kerja:** Sistem secara bawaan memiliki akun standar (Aset, Kewajiban, Ekuitas, Pendapatan, Beban). Anda dapat menambahkan akun spesifik sesuai kebutuhan pembukuan internal.

### D. Outlets & Users
* **Kegunaan:** Mengelola cabang bisnis (Outlet) dan mengatur hak akses karyawan (Admin, Staff Gudang, Akuntan, dll) ke cabang-cabang tertentu.

---

## 2. Modul Pembelian (Invoices & Vendors)
Modul ini mencatat pengeluaran uang untuk pembelian barang/jasa dari *Supplier* (Vendor) yang akan menambah aset persediaan (Inventory) atau memunculkan Beban (Expense).

### A. Vendors (Pemasok)
* **Kegunaan:** Mencatat data *Supplier* langganan Anda.

### B. Invoices (Faktur Pembelian)
* **Kegunaan:** Mencatat tagihan dari *Supplier* dan memasukkan barang ke Gudang.
* **Alur Penggunaan:**
  1. **Upload / Buat Draft:** Masukkan data nomor *invoice*, tanggal, dan total tagihan.
  2. **Review & Mapping:** Sistem memetakan baris tagihan. Di sini Anda wajib menentukan apakah sebuah baris adalah **Stok Gudang** (akan menambah *Inventory*) atau **Biaya Langsung** (contoh: Biaya listrik, ongkir).
  3. **Disassembly (Jika Ada):** Jika barang yang dibeli disetujui untuk dipecah (contoh: Paha Sapi), Anda wajib menginput persentase *Actual Yield* (berat asli) dari Daging, Tulang, dsb.
  4. **Post Invoice:** Setelah klik *Post*, sistem otomatis akan:
     - Menambah stok komponen ke gudang secara fisik (HPP dihitung proporsional, *Waste* dihitung Rp 0).
     - Mencatat Jurnal Akuntansi (Hutang Usaha bertambah, Persediaan bertambah).

---

## 3. Modul Manajemen Gudang (Inventory)
Modul untuk melacak pergerakan fisik barang (Masuk & Keluar) dan nilai keuangannya.

### A. Stock Ledger & Balance
* **Kegunaan:** Melihat sisa stok (*Qty on Hand*) secara *real-time* di cabang yang Anda pilih.
* **Cara Kerja:** Menggunakan metode **Rata-rata Bergerak (Moving Average)** untuk menghitung Harga Pokok (HPP/Unit Cost) yang dinamis setiap kali ada pembelian baru dengan harga berbeda. Klik nama barang untuk melihat riwayat keluar-masuknya.

### B. Stock Opname
* **Kegunaan:** Melakukan penyesuaian (koreksi) stok fisik di gudang agar cocok dengan sistem.
* **Cara Kerja:** Anda menginput stok fisik aktual. Jika ada selisih, sistem otomatis membuat **Jurnal Penyesuaian** (membebankan selisih ke akun *Inventory Shrinkage* / Selisih Stok).

---

## 4. Modul Produksi (Production)
Modul ini digunakan oleh bagian dapur atau fasilitas produksi.

* **Kegunaan:** Mencatat proses pembuatan *Finished Goods* dari *Raw Materials*.
* **Alur Penggunaan:**
  1. Pilih produk akhir yang akan dibuat dan jumlah (Qty) targetnya.
  2. Sistem akan menarik resep (**BOM**) dan menghitung estimasi bahan baku yang diperlukan.
  3. Konfirmasi pengerjaan.
  4. Sistem akan otomatis **memotong stok bahan baku (OUT)** dan **menambah stok barang jadi (IN)**, serta memindahkan HPP bahan baku menjadi nilai aset barang jadi tersebut.

---

## 5. Modul Akuntansi (Accounting)
Pusat pelaporan finansial hasil rekam jejak otomatis dari modul-modul lain (Pembelian, Opname, Produksi, dan Penjualan POS).

### A. Jurnal (Journal & Manual Entry)
* **Kegunaan:** Melihat seluruh histori perpindahan debit dan kredit.
* **Manual Entry:** Digunakan oleh Akuntan untuk membuat jurnal penyesuaian akhir bulan secara manual (contoh: Beban Penyusutan, koreksi *Waste* abnormal). Syaratnya: Total Debit harus sama dengan Total Credit.

### B. Accounts Payable (Hutang Usaha)
* **Kegunaan:** Memantau *Invoices* mana yang berstatus *Unpaid* atau *Partial*, serta mencatat saat perusahaan membayar lunas tagihan ke *Vendor*.

### C. Import POS (Integrasi Penjualan)
* **Kegunaan:** Menarik data transaksi dari Point of Sales (misal: Moka POS) untuk diposting secara agregat harian ke dalam jurnal (Mencatat Pendapatan Kas, memotong stok barang jadi, dan mengakui Harga Pokok Penjualan/COGS).

### D. Reports (Laporan Keuangan)
* **Kegunaan:** Mengakses **Laba Rugi (Profit & Loss)** dan **Neraca (Balance Sheet)** secara *real-time* untuk menganalisa kesehatan finansial perusahaan.

---
*Dokumen ini merupakan panduan garis besar operasional sistem. Setiap pengguna (user) dianjurkan beroperasi hanya pada modul yang menjadi otoritas dan kewenangannya.*
