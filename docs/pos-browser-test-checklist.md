# POS — browser test checklist (void v2, refund, shift cash)

Tanggal dibuat: 2026-10-31 · Branch: `feat/pos-void-reversal`
Migrasi yang sudah terpasang di produksi: `20260928110000_pos_void_reversal`, `20260928120000_pos_refunds`
Migrasi menunggu persetujuan: `20260928130000_pos_close_shift_revoke_anon`

Centang `[x]` kalau lolos, tulis catatan di baris bawahnya kalau ada yang aneh.

## Hasil run 2026-10-31 (outlet test, org "Cloudmelt SMI", dev server lokal → DB produksi)

Lolos:
- Order uji dengan diskon order 10%: Rp 12.000 (subtotal 12.000, diskon −1.200, pajak 1.188, pembulatan 12) — 1.
- Void via UI: dialog teks baru, toast sukses, status `voided`, `gl_status = 'void'` — 2 (sebagian, lihat "Belum").
- Dialog refund: stepper, metode Cash, catatan kas, tombol nonaktif sampai item + alasan terisi — 3.
- Penolakan order `pending_mapping` (HTTP 400, pesan jelas) — 5.
- Setelah mapping + Repost: order jadi `posted` (Dr Kas 12.000 / Cr pendapatan 10.800, pajak 1.188, pembulatan 12).
- Refund sebagian 1× Keju Aroma: toast **Rp 2.997** (pendapatan 2.700 + pajak 297), jurnal Dr 2.997 = Cr 2.997, tercatat di shift terbuka — 3.
- Dialog Close Shift: baris "Cash Refunds This Shift −Rp 2.997", Expected = 0 + 144.000 − 2.997 = Rp 141.003 — 6 (sebagian).

Belum diuji di browser:
- Void yang benar-benar membalik jurnal/stok (order uji void tadi `pending_mapping`, item uji tidak melacak stok). Sudah terbukti di dry-run SQL dengan order nyata.
- Refund sampai habis (pajak/pembulatan sisa), over-refund, void setelah refund, kasir (403), refund non-tunai, refund tunai tanpa shift, tutup shift sebenarnya, laporan setelah ganti rentang tanggal.

Temuan: org ini punya 20 order lama `pending_mapping` (mapping pendapatan sebelumnya kosong). Yang baru-baru ini sudah ter-repost sebagian.

---

## 0. Persiapan

- [ ] Login sebagai **owner** atau **admin** di outlet uji.
- [ ] Siapkan **1 akun kasir** di outlet yang sama (untuk tes pembatasan role).
- [ ] Ada **shift yang sedang buka** (Point of Sale → Open Shift, kas awal mis. Rp 100.000).
- [ ] Settings → POS → PPN aktif (mis. 11%) dan pembulatan aktif (mis. kelipatan 500). Catat nilainya: `____`
- [ ] Settings → Accounting → POS Mapping: akun pendapatan, pajak (PPN Keluaran), HPP, persediaan, dan metode bayar sudah terpetakan. (Kalau belum, order akan berstatus `pending_mapping` dan refund ditolak — itu juga bagian tes di 5.)
- [ ] Siapkan 2 produk uji: **A** (punya resep/BOM, stok bahan cukup) dan **B** (tanpa BOM atau non-inventory).

## 1. Buat order uji (dasar untuk tes lainnya)

Buat order dengan: **2× produk A + 3× produk B**, bayar **Cash**, beri **diskon order 10%** (owner/admin).

- [ ] Order selesai tanpa error, struk muncul.
- [ ] Catat: subtotal `____` · diskon `____` · pajak `____` · pembulatan `____` · total `____`
- [ ] Buka Inventory → stok bahan produk A **berkurang** sesuai resep.
- [ ] Buat 1 order kedua yang lebih kecil (1× produk B, Cash) — dipakai khusus untuk tes **Void**.

## 2. Void (v2)

Dari **Penjualan POS → tabel transaksi**:

- [ ] Order kedua (hari ini, shift buka): tombol **Void** muncul. Klik → isi alasan → konfirmasi.
- [ ] Status berubah **Voided**; tombol Void/Refund hilang untuk order itu.
- [ ] Teks dialog Void menyebut jurnal **dibalik** (bukan "dihapus").
- [ ] Kartu **Dibatalkan** bertambah 1.
- [ ] Inventory → Ledger: ada baris pembalik (`IN`, referensi pos_order_void) untuk bahan yang terpotong. Kolom **Stok Keluar** bulan ini tidak ikut menghitung baris pembalik sebagai "stok masuk".
- [ ] Accounting → Jurnal: entri asli **masih ada** + entri `VOID:` dengan debit/kredit terbalik; total net nol.
- [ ] Order dari **hari lain** → tombol Void **tidak** muncul.
- [ ] Order di **shift yang sudah ditutup** → void ditolak dengan pesan jelas (uji nanti setelah bagian 6).
- [ ] Login sebagai **kasir outlet lain** (jika ada) → tidak bisa void order ini.

## 3. Refund sebagian

Pada order dari langkah 1 (tombol **Refund**, hanya muncul untuk owner/admin):

- [ ] Dialog menampilkan semua baris dengan stepper jumlah; tombol **Proses Refund** nonaktif sampai ada item dipilih **dan** alasan diisi.
- [ ] Pilih **1× produk B**, metode **Cash**, alasan → proses.
- [ ] Toast menampilkan jumlah refund. Catat: `____` (harus = nilai bersih 1 unit B setelah porsi diskon + pajak proporsional).
- [ ] Baris order sekarang punya badge **Refund sebagian**; kartu **Refund** di atas bertambah.
- [ ] Jurnal: entri `POS Refund Revenue` (debit), `POS Refund Tax` (debit), `POS Refund Payment (Cash)` (kredit). **Debit = kredit**.
- [ ] Stok bahan **tidak** berubah (by design).
- [ ] Coba refund **lebih banyak dari yang terjual** (mis. 4× B) → ditolak dengan pesan jumlah/sisa.
- [ ] Order ini sekarang **tidak bisa di-void** (tombol Void hilang; kalau dipaksa lewat API → ditolak).

## 4. Refund sampai habis

- [ ] Refund sisa item sampai semuanya habis (2× A dan 2× B).
- [ ] Badge berubah menjadi **Refund penuh**; tombol Refund hilang.
- [ ] Total semua refund order ini = **total order** persis (pajak + pembulatan ikut kembali di refund terakhir). Catat: `____` vs `____`
- [ ] Refund tambahan lewat API → ditolak ("exceed" / tidak ada sisa).

## 5. Pembatasan & kasus tepi

- [ ] Login **kasir**: halaman Penjualan POS **tidak** menampilkan tombol Refund. Panggil `POST /api/pos/refund` manual → **403**.
- [ ] Order dengan status `pending_mapping` (hapus sementara satu mapping, buat order baru) → Refund ditolak dengan pesan "belum terjurnal penuh". Kembalikan mapping + **Repost**, lalu refund berhasil.
- [ ] Refund dengan metode **QRIS/Card** tanpa shift terbuka → berhasil (non-tunai tidak butuh shift).
- [ ] Refund **Cash** saat **tidak ada shift terbuka** → ditolak ("harus dicatat pada shift yang terbuka").

## 6. Kas di akhir shift

Mulai shift baru dengan kas awal Rp 100.000, lalu: jual Cash Rp X, refund Cash sebagian Rp Y.

- [ ] Dialog **Close Shift** menampilkan: Opening Float, Cash Sales, **Cash Refunds This Shift (−Y)**, dan Expected Cash = 100.000 + X − Y.
- [ ] Isi uang hitung = Expected → variance **0**, shift tertutup tanpa jurnal selisih.
- [ ] Shift History / Shift Report: `expected_cash` tersimpan sama dengan di dialog.
- [ ] Setelah ditutup: void order dari shift itu → **ditolak**.
- [ ] Refund QRIS/Card tidak mengubah Expected Cash.

## 7. Laporan

- [ ] Kartu **Total Penjualan** = penjualan sebelum refund; kartu **Refund** = refund yang dilakukan pada periode tsb (berdasarkan tanggal refund).
- [ ] Filter rentang tanggal berbeda → angka Refund ikut berubah sesuai tanggal refund.
- [ ] Export PDF/Excel tetap jalan tanpa error. (Catatan: refund **belum** muncul di PDF/Excel/Shift Report — lihat Backlog.)

## 8. Cek database (opsional, read-only)

```sql
-- jurnal refund seimbang per refund
select reference_id, sum(debit) d, sum(credit) c
from gl_entries where reference_type = 'pos_refund' group by 1 having sum(debit) <> sum(credit);  -- harus 0 baris

-- jurnal void seimbang per order
select reference_id, sum(debit) d, sum(credit) c
from gl_entries where reference_type in ('pos_order','pos_order_void') group by 1 having sum(debit) <> sum(credit);  -- harus 0 baris

-- jumlah refund tidak melebihi total order
select o.id, o.total_amount, sum(r.amount) refunded
from pos_orders o join pos_refunds r on r.order_id = o.id
group by o.id, o.total_amount having sum(r.amount) > o.total_amount;  -- harus 0 baris
```

## Backlog (belum dikerjakan)

- Refund belum tampil di PDF/Excel laporan penjualan, Shift Report, dan perbandingan periode.
- Restock-on-refund (opsional per baris) — saat ini stok & HPP tidak dikembalikan.
- Refund oleh kasir dengan PIN manajer.
- **Keamanan:** 44 fungsi SECURITY DEFINER di schema `public` masih bisa dieksekusi `anon` lewat anon key publik, banyak yang tidak mengecek pemanggil di dalamnya (mis. `void_invoice`, `post_*`, `process_pos_order`, `open_pos_shift`). Perlu audit + `REVOKE ... FROM public, anon` per fungsi dan pengecekan `auth.uid()`/role di dalamnya. Yang pasti perlu: `close_pos_shift` (migrasi `20260928130000` menunggu persetujuan).
