import { Card, CardContent } from '@/components/ui/card'
import { BookOpen, Settings, PackageSearch, Receipt, Utensils, Calculator } from 'lucide-react'

export default function SopPage() {
  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-16">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 rounded-lg bg-orange-500/20 flex items-center justify-center border border-orange-500/30">
          <BookOpen className="h-6 w-6 text-orange-400" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-100">SOP ByteSuite ERP</h1>
          <p className="text-zinc-400 mt-1">Panduan lengkap standar operasional dan fungsionalitas modul sistem.</p>
        </div>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/40">
        <CardContent className="p-8 space-y-12">
          
          <section className="space-y-4">
            <p className="text-zinc-300 leading-relaxed">
              Selamat datang di panduan penggunaan <strong>ByteSuite ERP</strong>. Dokumen ini dirancang untuk memandu pengguna dalam mengoperasikan modul-modul utama di dalam sistem. ByteSuite ERP dibangun untuk mensinkronisasi operasional bisnis mulai dari pengaturan master data, pembelian, manajemen gudang, produksi, hingga akuntansi keuangan (Jurnal, Buku Besar, dan Laba Rugi).
            </p>
          </section>

          {/* 1. Settings */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-2">
              <Settings className="h-5 w-5 text-blue-400" />
              <h2 className="text-xl font-bold text-zinc-100">1. Modul Pengaturan & Master Data (Settings)</h2>
            </div>
            <p className="text-zinc-400 text-sm">Modul ini adalah pusat kendali awal. Semua data harus didaftarkan di sini sebelum transaksi dapat dilakukan.</p>
            
            <div className="space-y-6">
              <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
                <h3 className="text-lg font-semibold text-zinc-200 mb-2">A. Items (Barang & Bahan)</h3>
                <ul className="list-disc pl-5 space-y-2 text-zinc-300 text-sm">
                  <li><strong>Kegunaan:</strong> Mendaftarkan seluruh bahan baku (Raw), barang setengah jadi (WIP), kemasan (Packaging), hingga produk siap jual (Finished Goods).</li>
                  <li><strong>Fitur Utama:</strong>
                    <ul className="list-[circle] pl-5 mt-1 space-y-1 text-zinc-400">
                      <li><strong>UOM Conversion:</strong> Mengatur konversi satuan beli ke satuan resep (contoh: Beli dalam "KG", dipakai dalam "Gram").</li>
                      <li><strong>Disassembly Settings:</strong> Khusus untuk bahan baku utuh (misal: Sapi Utuh) yang perlu dipecah menjadi komponen (Daging, Tulang) saat masuk gudang.</li>
                      <li><strong>Reorder Level:</strong> Batas minimal stok yang memicu peringatan restock.</li>
                    </ul>
                  </li>
                </ul>
              </div>

              <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
                <h3 className="text-lg font-semibold text-zinc-200 mb-2">B. BOM (Bill of Materials / Resep)</h3>
                <ul className="list-disc pl-5 space-y-2 text-zinc-300 text-sm">
                  <li><strong>Kegunaan:</strong> Mendaftarkan resep atau formula produksi untuk barang jadi (Finished Goods) atau WIP.</li>
                  <li><strong>Cara Kerja:</strong> Anda menentukan berapa banyak bahan baku yang dibutuhkan untuk menghasilkan 1 unit barang jadi. BOM ini akan dipanggil secara otomatis oleh modul Produksi.</li>
                </ul>
              </div>

              <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
                <h3 className="text-lg font-semibold text-zinc-200 mb-2">C. Chart of Accounts (COA) & Lainnya</h3>
                <ul className="list-disc pl-5 space-y-2 text-zinc-300 text-sm">
                  <li><strong>COA:</strong> Mendaftarkan daftar akun akuntansi. Sistem memiliki akun standar, dan Anda dapat menambah akun spesifik.</li>
                  <li><strong>Outlets & Users:</strong> Mengelola cabang bisnis dan mengatur hak akses karyawan ke cabang-cabang tertentu.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 2. Invoices & AP */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-2">
              <Receipt className="h-5 w-5 text-emerald-400" />
              <h2 className="text-xl font-bold text-zinc-100">2. Modul Pembelian (Invoices & Vendors)</h2>
            </div>
            <p className="text-zinc-400 text-sm">Mencatat pengeluaran uang untuk pembelian barang/jasa dari Supplier yang akan menambah aset persediaan atau memunculkan beban.</p>
            
            <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
              <h3 className="text-lg font-semibold text-zinc-200 mb-3">Alur Penggunaan Invoices:</h3>
              <ol className="list-decimal pl-5 space-y-3 text-zinc-300 text-sm marker:text-zinc-500 font-medium">
                <li><strong className="text-zinc-200">Upload / Buat Draft:</strong> Masukkan data nomor invoice, tanggal, dan total tagihan.</li>
                <li><strong className="text-zinc-200">Review & Mapping:</strong> Sistem memetakan baris tagihan. Wajib menentukan apakah baris adalah Stok Gudang atau Biaya Langsung (Expense).</li>
                <li><strong className="text-zinc-200">Disassembly (Jika Ada):</strong> Jika barang dibeli utuh (contoh: Paha Sapi), Anda wajib menginput Actual Yield (berat asli) komponen Daging, Tulang, dsb.</li>
                <li><strong className="text-zinc-200">Post Invoice:</strong> Setelah di-post, sistem otomatis akan menambah stok komponen fisik (HPP proporsional, Waste Rp 0) dan mencatat Jurnal Akuntansi.</li>
              </ol>
            </div>
          </section>

          {/* 3. Inventory */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-2">
              <PackageSearch className="h-5 w-5 text-amber-400" />
              <h2 className="text-xl font-bold text-zinc-100">3. Modul Manajemen Gudang (Inventory)</h2>
            </div>
            <p className="text-zinc-400 text-sm">Melacak pergerakan fisik barang dan nilai keuangannya.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
                <h3 className="text-base font-semibold text-zinc-200 mb-2">Stock Ledger & Balance</h3>
                <p className="text-zinc-300 text-sm leading-relaxed">Melihat sisa stok (Qty on Hand) secara real-time. Menggunakan metode Rata-rata Bergerak (Moving Average) untuk menghitung HPP yang dinamis setiap kali ada pembelian.</p>
              </div>
              <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
                <h3 className="text-base font-semibold text-zinc-200 mb-2">Stock Opname</h3>
                <p className="text-zinc-300 text-sm leading-relaxed">Penyesuaian (koreksi) stok fisik di gudang. Jika ada selisih, sistem otomatis membuat Jurnal Penyesuaian (Inventory Shrinkage).</p>
              </div>
            </div>
          </section>

          {/* 4. Production */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-2">
              <Utensils className="h-5 w-5 text-purple-400" />
              <h2 className="text-xl font-bold text-zinc-100">4. Modul Produksi (Production)</h2>
            </div>
            
            <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
              <p className="text-zinc-300 text-sm mb-4">Digunakan oleh bagian dapur/produksi untuk mencatat pembuatan Finished Goods dari Raw Materials.</p>
              <h3 className="text-sm font-semibold text-zinc-400 mb-2 uppercase tracking-wider">Alur Produksi:</h3>
              <ol className="list-decimal pl-5 space-y-2 text-zinc-300 text-sm marker:text-zinc-500">
                <li>Pilih produk akhir yang akan dibuat dan jumlah targetnya.</li>
                <li>Sistem otomatis menarik resep (BOM) dan menghitung estimasi bahan baku.</li>
                <li>Konfirmasi pengerjaan.</li>
                <li>Sistem memotong stok bahan baku (OUT) dan menambah stok barang jadi (IN), lalu memindahkan HPP bahan baku ke barang jadi.</li>
              </ol>
            </div>
          </section>

          {/* 5. Accounting */}
          <section className="space-y-6">
            <div className="flex items-center gap-3 border-b border-zinc-800 pb-2">
              <Calculator className="h-5 w-5 text-rose-400" />
              <h2 className="text-xl font-bold text-zinc-100">5. Modul Akuntansi (Accounting)</h2>
            </div>
            <p className="text-zinc-400 text-sm">Pusat pelaporan finansial hasil rekam jejak otomatis dari modul-modul lain.</p>

            <div className="space-y-4">
              <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
                <h3 className="text-base font-semibold text-zinc-200 mb-2">Jurnal & Manual Entry</h3>
                <p className="text-zinc-300 text-sm">Melihat seluruh histori debit/kredit. Terdapat fitur Manual Entry untuk jurnal penyesuaian akhir bulan (syarat: Total Debit = Total Credit).</p>
              </div>
              <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
                <h3 className="text-base font-semibold text-zinc-200 mb-2">Accounts Payable (Hutang Usaha)</h3>
                <p className="text-zinc-300 text-sm">Memantau Invoices yang berstatus Unpaid atau Partial, dan mencatat pelunasan tagihan ke Vendor.</p>
              </div>
              <div className="bg-zinc-950/50 p-4 rounded-lg border border-zinc-800">
                <h3 className="text-base font-semibold text-zinc-200 mb-2">Laporan Keuangan (Reports)</h3>
                <p className="text-zinc-300 text-sm">Mengakses Laba Rugi (Profit & Loss) dan Neraca (Balance Sheet) secara real-time.</p>
              </div>
            </div>
          </section>

        </CardContent>
      </Card>
      
      <div className="text-center text-zinc-500 text-xs">
        <p>Dokumen ini merupakan panduan garis besar operasional sistem.</p>
        <p>Setiap pengguna dianjurkan beroperasi hanya pada modul yang menjadi otoritas dan kewenangannya.</p>
      </div>
    </div>
  )
}
