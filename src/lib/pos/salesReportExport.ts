import { format } from 'date-fns'
import { formatRp } from '@/lib/format'
import type { PosSalesSummary, SalesTrend, PosSaleDetailRow, PosSaleItemRow } from '@/lib/pos/salesSummary'
import type { SalesAnalytics } from '@/lib/pos/salesAnalytics'

export interface SalesReportExportData {
  outletName: string
  periodLabel: string
  summary: PosSalesSummary
  trend: SalesTrend
  analytics: SalesAnalytics | null
  saleDetails: PosSaleDetailRow[]
  itemRows: PosSaleItemRow[]
  /** Optional chart area to embed as an image in the PDF. */
  chartsEl?: HTMLElement | null
}

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
const pct = (cur: number, prev: number) => (prev > 0 ? `${(((cur - prev) / prev) * 100).toFixed(1)}%` : '-')
const stamp = (iso: string) => format(new Date(iso), 'yyyy-MM-dd HH:mm')
const statusLabel = (s: string) => (s === 'voided' ? 'Voided' : 'Selesai')
const fileBase = (d: SalesReportExportData, ext: string) =>
  `laporan-penjualan-pos-${d.outletName.replace(/[^\w-]+/g, '_')}-${format(new Date(), 'yyyyMMdd-HHmm')}.${ext}`

function kpiRows(d: SalesReportExportData): [string, string | number][] {
  const s = d.summary
  return [
    ['Penjualan Kotor', s.grossSales],
    ['Diskon', s.discountTotal],
    ['Pajak', s.taxTotal],
    ['Pembulatan', s.roundingTotal],
    ['Total Penjualan', s.netSales],
    ['Jumlah Transaksi', s.orderCount],
    ['Rata-rata Transaksi', Math.round(s.averageTransaction)],
    ['Transaksi Dibatalkan', s.voidedCount],
    ['Nilai Dibatalkan', s.voidedAmount],
    ['Komplimen', s.compTotal],
  ]
}

export async function exportSalesReportExcel(d: SalesReportExportData) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()
  const add = (name: string, rows: (string | number)[][], widths?: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    if (widths) ws['!cols'] = widths.map(wch => ({ wch }))
    XLSX.utils.book_append_sheet(wb, ws, name)
  }

  const ringkasan: (string | number)[][] = [
    ['Laporan Penjualan POS'],
    ['Outlet', d.outletName],
    ['Periode', d.periodLabel],
    ['Dibuat', format(new Date(), 'yyyy-MM-dd HH:mm')],
    [],
    ['Ringkasan', 'Nilai'],
    ...kpiRows(d),
  ]
  if (d.analytics) {
    const { current: c, previous: p, previousLabel } = d.analytics
    ringkasan.push([], [`Perbandingan dengan periode sebelumnya (${previousLabel})`, 'Sekarang', 'Sebelumnya', 'Perubahan'],
      ['Total Penjualan', c.netSales, p.netSales, pct(c.netSales, p.netSales)],
      ['Jumlah Transaksi', c.orderCount, p.orderCount, pct(c.orderCount, p.orderCount)],
      ['Rata-rata Transaksi', Math.round(c.averageTransaction), Math.round(p.averageTransaction), pct(c.averageTransaction, p.averageTransaction)])
  }
  add('Ringkasan', ringkasan, [44, 18, 18, 14])

  add('Metode Bayar', [['Metode', 'Jumlah'], ...d.summary.tenders.map(t => [t.method, t.amount])], [28, 18])
  add('Kategori', [['Kategori', 'Qty', 'Pendapatan'], ...d.summary.categoryBreakdown.map(c => [c.category, c.qty, c.revenue])], [28, 10, 18])
  add('Item Terlaris', [['Item', 'Qty', 'Pendapatan'], ...d.summary.topItems.map(i => [i.name, i.qty, i.revenue])], [36, 10, 18])
  add('Tren', [[d.trend.granularity === 'hour' ? 'Jam' : 'Tanggal', 'Penjualan', 'Transaksi'], ...d.trend.points.map(p => [p.label, p.sales, p.orders])], [16, 18, 12])

  if (d.analytics) {
    const a = d.analytics
    add('Hari x Jam', [['Penjualan', ...Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`)], ...a.heatmapSales.map((row, i) => [DAYS[i], ...row])], [12, ...Array(24).fill(11)])
    add('Kasir', [['Kasir', 'Transaksi', 'Penjualan', 'Rata-rata', 'Diskon', 'Void'], ...a.cashiers.map(c => [c.name, c.orders, c.sales, Math.round(c.averageTransaction), c.discount, c.voided])], [26, 12, 18, 16, 16, 8])
    const m = a.paymentTrend.methods
    add('Tren Metode Bayar', [[a.paymentTrend.granularity === 'hour' ? 'Jam' : 'Tanggal', ...m], ...a.paymentTrend.points.map(p => [p.label, ...m.map(k => Number(p[k]) || 0)])], [16, ...m.map(() => 16)])
  }

  if (d.summary.compRecipients.length > 0) {
    add('Komplimen', [['Untuk / Alasan', 'Jumlah'], ...d.summary.compRecipients.map(r => [r.notes, r.amount])], [36, 18])
  }

  add('Detail Item', [
    ['Tanggal', 'Order ID', 'Kasir', 'Metode Bayar', 'Status', 'Item', 'Kategori', 'Qty', 'Harga Satuan', 'Diskon', 'Subtotal'],
    ...d.itemRows.map(r => [stamp(r.created_at), r.order_id, r.cashier_name, r.payment_methods, statusLabel(r.status), r.item_name, r.category, r.qty, r.unit_price, r.discount_amount, r.subtotal]),
  ], [17, 38, 18, 16, 9, 30, 16, 6, 13, 11, 13])

  // Last sheet: the raw transaction table.
  add('Data Transaksi', [
    ['Tanggal', 'Order ID', 'Kasir', 'Jumlah Item', 'Metode Bayar', 'Subtotal', 'Diskon', 'Pajak', 'Pembulatan', 'Total', 'Status'],
    ...d.saleDetails.map(r => [stamp(r.created_at), r.id, r.cashier_name, r.item_count, r.payment_methods, r.subtotal, r.discount_amount, r.tax_amount, r.rounding_amount, r.total_amount, statusLabel(r.status)]),
  ], [17, 38, 18, 12, 16, 13, 11, 11, 12, 13, 9])

  XLSX.writeFile(wb, fileBase(d, 'xlsx'))
}

export async function exportSalesReportPdf(d: SalesReportExportData) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const clean = (v: string) => v.replace(/[—–]/g, "-")
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 12
  const head = { fillColor: [39, 39, 42] as [number, number, number], textColor: 255, fontSize: 8 }
  const base = { theme: 'striped' as const, styles: { fontSize: 8, cellPadding: 1.6 }, headStyles: head, margin: { left: margin, right: margin } }
  const lastY = () => (doc as any).lastAutoTable?.finalY ?? 30
  const heading = (text: string, y: number) => {
    if (y > pageH - 30) { doc.addPage(); y = 18 }
    doc.setFontSize(11); doc.setTextColor(24, 24, 27); doc.text(text, margin, y)
    return y + 3
  }
  const right = { halign: 'right' as const }

  // Page 1: title, KPIs, comparison
  doc.setFontSize(16); doc.setTextColor(24, 24, 27)
  doc.text('Laporan Penjualan POS', margin, 16)
  doc.setFontSize(9); doc.setTextColor(82, 82, 91)
  doc.text(`${clean(d.outletName)}  |  ${clean(d.periodLabel)}  |  Dibuat ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, margin, 22)

  autoTable(doc, {
    ...base, startY: 27,
    head: [['Ringkasan', 'Nilai']],
    body: kpiRows(d).map(([k, v]) => [k, typeof v === 'number' && !/Jumlah|Transaksi Dibatalkan/.test(k) ? formatRp(v) : String(v)]),
    columnStyles: { 1: right }, tableWidth: 110,
  })
  if (d.analytics) {
    const { current: c, previous: p, previousLabel } = d.analytics
    autoTable(doc, {
      ...base, startY: 27, margin: { left: margin + 122, right: margin },
      head: [[`Vs periode sebelumnya (${clean(previousLabel)})`, 'Sekarang', 'Sebelumnya', 'Ubah']],
      body: [
        ['Total Penjualan', formatRp(c.netSales), formatRp(p.netSales), pct(c.netSales, p.netSales)],
        ['Transaksi', String(c.orderCount), String(p.orderCount), pct(c.orderCount, p.orderCount)],
        ['Rata-rata', formatRp(c.averageTransaction), formatRp(p.averageTransaction), pct(c.averageTransaction, p.averageTransaction)],
      ],
      columnStyles: { 1: right, 2: right, 3: right },
    })
  }

  // Charts captured from the on-screen dashboard
  if (d.chartsEl) {
    try {
      const { default: html2canvas } = await import('html2canvas-pro')
      const canvas = await html2canvas(d.chartsEl, { scale: 1.5, backgroundColor: '#18181b', useCORS: true })
      doc.addPage()
      const w = pageW - margin * 2
      const h = Math.min((canvas.height / canvas.width) * w, pageH - margin * 2 - 8)
      doc.setFontSize(11); doc.setTextColor(24, 24, 27); doc.text('Grafik', margin, 14)
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', margin, 18, w, h)
    } catch {
      // Charts are a bonus; the tables below still carry all the data.
    }
  }

  // Tables
  doc.addPage()
  let y = heading('Metode Pembayaran', 16)
  autoTable(doc, { ...base, startY: y, head: [['Metode', 'Jumlah']], body: d.summary.tenders.map(t => [t.method, formatRp(t.amount)]), columnStyles: { 1: right }, tableWidth: 110 })
  autoTable(doc, { ...base, startY: y, margin: { left: margin + 122, right: margin }, head: [['Kategori', 'Qty', 'Pendapatan']], body: d.summary.categoryBreakdown.map(c => [c.category, String(c.qty), formatRp(c.revenue)]), columnStyles: { 1: right, 2: right } })
  y = heading('Item Terlaris', lastY() + 8)
  autoTable(doc, { ...base, startY: y, head: [['Item', 'Qty', 'Pendapatan']], body: d.summary.topItems.map(i => [i.name, String(i.qty), formatRp(i.revenue)]), columnStyles: { 1: right, 2: right } })

  if (d.analytics) {
    const a = d.analytics
    y = heading('Performa Kasir', lastY() + 8)
    autoTable(doc, { ...base, startY: y, head: [['Kasir', 'Transaksi', 'Penjualan', 'Rata-rata', 'Diskon', 'Void']], body: a.cashiers.map(c => [c.name, String(c.orders), formatRp(c.sales), formatRp(c.averageTransaction), formatRp(c.discount), String(c.voided)]), columnStyles: { 1: right, 2: right, 3: right, 4: right, 5: right } })

    doc.addPage()
    y = heading('Penjualan Hari x Jam (warna lebih pekat = lebih ramai)', 16)
    const max = Math.max(1, ...a.heatmapSales.flat())
    autoTable(doc, {
      ...base, startY: y, styles: { fontSize: 6, cellPadding: 1, halign: 'center' },
      head: [['', ...Array.from({ length: 24 }, (_, h) => String(h))]],
      body: a.heatmapSales.map((row, i) => [DAYS[i], ...row.map(v => (v > 0 ? String(Math.round(v / 1000)) : ''))]),
      didParseCell: (data: any) => {
        if (data.section !== 'body' || data.column.index === 0) return
        const v = a.heatmapSales[data.row.index][data.column.index - 1]
        const t = v / max
        data.cell.styles.fillColor = [255 - Math.round(t * 156), 255 - Math.round(t * 153), 255 - Math.round(t * 14)]
        data.cell.styles.textColor = t > 0.55 ? 255 : 40
      },
    })
    doc.setFontSize(7); doc.setTextColor(113, 113, 122); doc.text('Nilai dalam ribu rupiah.', margin, lastY() + 4)
  }

  if (d.summary.compRecipients.length > 0) {
    y = heading('Komplimen', lastY() + 10)
    autoTable(doc, { ...base, startY: y, head: [['Untuk / Alasan', 'Jumlah']], body: d.summary.compRecipients.map(r => [r.notes, formatRp(r.amount)]), columnStyles: { 1: right }, tableWidth: 110 })
  }

  // Item detail, then — as the very last pages — the raw transaction table.
  doc.addPage()
  y = heading(`Detail Item per Transaksi (${d.itemRows.length} baris)`, 16)
  autoTable(doc, {
    ...base, startY: y, styles: { fontSize: 7, cellPadding: 1.2 },
    head: [['Tanggal', 'Order', 'Item', 'Kategori', 'Qty', 'Harga', 'Diskon', 'Subtotal', 'Kasir', 'Status']],
    body: d.itemRows.map(r => [stamp(r.created_at), r.order_id.slice(0, 8).toUpperCase(), r.item_name, r.category, String(r.qty), formatRp(r.unit_price), r.discount_amount > 0 ? `-${formatRp(r.discount_amount)}` : '-', formatRp(r.subtotal), r.cashier_name, statusLabel(r.status)]),
    columnStyles: { 4: right, 5: right, 6: right, 7: right },
  })

  doc.addPage()
  y = heading(`Data Transaksi (${d.saleDetails.length} transaksi)`, 16)
  autoTable(doc, {
    ...base, startY: y, styles: { fontSize: 7, cellPadding: 1.2 },
    head: [['Tanggal', 'Order', 'Kasir', 'Item', 'Bayar', 'Subtotal', 'Diskon', 'Pajak', 'Pembulatan', 'Total', 'Status']],
    body: d.saleDetails.map(r => [stamp(r.created_at), r.id.slice(0, 8).toUpperCase(), r.cashier_name, String(r.item_count), r.payment_methods, formatRp(r.subtotal), r.discount_amount > 0 ? `-${formatRp(r.discount_amount)}` : '-', formatRp(r.tax_amount), r.rounding_amount > 0 ? formatRp(r.rounding_amount) : '-', formatRp(r.total_amount), statusLabel(r.status)]),
    columnStyles: { 3: right, 5: right, 6: right, 7: right, 8: right, 9: right },
  })

  const pages = doc.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7); doc.setTextColor(113, 113, 122)
    doc.text(`Halaman ${i} / ${pages}`, pageW - margin, pageH - 6, { align: 'right' })
  }
  doc.save(fileBase(d, 'pdf'))
}
