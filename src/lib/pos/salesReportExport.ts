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
  /** Name shown on the PDF cover ("Dibuat oleh"). */
  generatedBy?: string
  /** Captured image of the on-screen charts, embedded in the PDF and the Excel dashboard. */
  chartsImage?: ChartsImage | null
}

export interface ChartsImage {
  dataUrl: string
  width: number
  height: number
}

/** Rasterises the on-screen chart area once, for reuse by both exports. */
export async function captureChartsImage(el: HTMLElement | null): Promise<ChartsImage | null> {
  if (!el) return null
  try {
    const { default: html2canvas } = await import('html2canvas-pro')
    const canvas = await html2canvas(el, { scale: 1.5, backgroundColor: '#18181b', useCORS: true })
    return { dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height }
  } catch {
    return null
  }
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
  const { exportSalesReportExcel: run } = await import('@/lib/pos/salesReportExcel')
  await run(d, fileBase(d, 'xlsx'))
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

  // Cover
  doc.setFillColor(9, 9, 11)
  doc.rect(0, 0, pageW, pageH, 'F')
  doc.setFillColor(79, 70, 229)
  doc.roundedRect(margin + 8, 30, 22, 22, 5, 5, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(20)
  doc.text('B', margin + 19, 45.5, { align: 'center' })
  doc.setFontSize(11); doc.setFont('helvetica', 'normal'); doc.setTextColor(161, 161, 170)
  doc.text('ByteSuite', margin + 34, 42)
  doc.setFontSize(34); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255)
  doc.text('Laporan Penjualan POS', margin + 8, 88)
  doc.setFillColor(79, 70, 229)
  doc.rect(margin + 8, 95, 40, 1.4, 'F')
  doc.setFontSize(16); doc.setFont('helvetica', 'normal'); doc.setTextColor(228, 228, 231)
  doc.text(clean(d.outletName), margin + 8, 108)
  doc.setFontSize(12); doc.setTextColor(161, 161, 170)
  doc.text(clean(d.periodLabel), margin + 8, 116)
  const kpis: [string, string][] = [
    ['TOTAL PENJUALAN', formatRp(d.summary.netSales)],
    ['TRANSAKSI', String(d.summary.orderCount)],
    ['RATA-RATA TRANSAKSI', formatRp(d.summary.averageTransaction)],
  ]
  kpis.forEach(([label, value], i) => {
    const x = margin + 8 + i * 80
    doc.setFontSize(8); doc.setTextColor(113, 113, 122); doc.text(label, x, 146)
    doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255); doc.text(value, x, 155)
    doc.setFont('helvetica', 'normal')
  })
  doc.setFontSize(9); doc.setTextColor(113, 113, 122)
  doc.text(`Dibuat ${format(new Date(), 'dd/MM/yyyy HH:mm')}${d.generatedBy ? ` oleh ${clean(d.generatedBy)}` : ''}`, margin + 8, pageH - 16)

  // Page 2: title, KPIs, comparison
  doc.addPage()
  doc.setFont('helvetica', 'normal')
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
  if (d.chartsImage) {
    doc.addPage()
    const w = pageW - margin * 2
    const h = Math.min((d.chartsImage.height / d.chartsImage.width) * w, pageH - margin * 2 - 8)
    doc.setFontSize(11); doc.setTextColor(24, 24, 27); doc.text('Grafik', margin, 14)
    doc.addImage(d.chartsImage.dataUrl, 'PNG', margin, 18, w, h)
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
    if (i > 1) doc.text(`Halaman ${i - 1} / ${pages - 1}`, pageW - margin, pageH - 6, { align: 'right' })
  }
  doc.save(fileBase(d, 'pdf'))
}
