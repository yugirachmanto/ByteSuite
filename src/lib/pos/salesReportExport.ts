import { format } from 'date-fns'
import { formatRp } from '@/lib/format'
import type { PosSalesSummary, SalesTrend, PosSaleDetailRow, PosSaleItemRow, DailySalesBreakdown } from '@/lib/pos/salesSummary'
import type { SalesAnalytics } from '@/lib/pos/salesAnalytics'

export interface SalesReportExportData {
  outletName: string
  periodLabel: string
  summary: PosSalesSummary
  trend: SalesTrend
  analytics: SalesAnalytics | null
  saleDetails: PosSaleDetailRow[]
  itemRows: PosSaleItemRow[]
  /** Per-day rollup for multi-day ranges — omitted/empty for a single-day range. */
  dailyBreakdown?: DailySalesBreakdown[]
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

/** Fetches a same-origin public asset and returns it as a data URL, for embedding in the PDF (jsPDF needs image data, not a URL). */
async function loadImageAsDataUrl(path: string): Promise<string | null> {
  try {
    const blob = await fetch(path).then(r => r.blob())
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
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
const fmtDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m} mnt ${s} dtk` : `${s} dtk`
}
/** vs-previous-period delta label + direction, or null when there's no baseline to compare against. */
const deltaOf = (cur: number, prev: number): { label: string; positive: boolean } | null => {
  if (prev <= 0) return null
  const p = pct(cur, prev)
  const positive = cur >= prev
  return { label: `${positive && !p.startsWith('-') ? '+' : ''}${p} vs sebelumnya`, positive }
}

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
  // Header text is centered on every table in the report (data cells keep
  // their own left/right alignment via columnStyles, which only applies to
  // the body section — jspdf-autotable never lets columnStyles touch head).
  const head = { fillColor: [39, 39, 42] as [number, number, number], textColor: 255, fontSize: 8, halign: 'center' as const }
  const base = { theme: 'striped' as const, styles: { fontSize: 8, cellPadding: 1.6 }, headStyles: head, margin: { left: margin, right: margin } }
  const lastY = () => (doc as any).lastAutoTable?.finalY ?? 30
  const heading = (text: string, y: number) => {
    if (y > pageH - 30) { doc.addPage(); y = 18 }
    doc.setFontSize(11); doc.setTextColor(24, 24, 27); doc.text(text, margin, y)
    return y + 3
  }
  const right = { halign: 'right' as const }

  /** A dedicated divider page before a major raw-data section, matching the cover's brand accent. */
  const sectionCover = (title: string, subtitle: string) => {
    doc.addPage()
    doc.setFillColor(255, 255, 255)
    doc.rect(0, 0, pageW, pageH, 'F')
    doc.setFillColor(79, 70, 229)
    doc.rect(margin, pageH / 2 - 20, 34, 1.4, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(26); doc.setTextColor(24, 24, 27)
    doc.text(title, margin, pageH / 2 - 4)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(113, 113, 122)
    doc.text(subtitle, margin, pageH / 2 + 8)
  }

  /** One KPI tile: label on top, big value, optional delta line under it. */
  const drawKpiCard = (x: number, y: number, w: number, h: number, label: string, value: string, opts: { delta?: { label: string; positive: boolean } | null; accent?: boolean } = {}) => {
    doc.setDrawColor(228, 228, 231)
    doc.setFillColor(opts.accent ? 238 : 250, opts.accent ? 238 : 250, opts.accent ? 255 : 251)
    doc.roundedRect(x, y, w, h, 2, 2, 'FD')
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(113, 113, 122)
    doc.text(label.toUpperCase(), x + 5, y + 10, { maxWidth: w - 10 })
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(opts.accent ? 16 : 13)
    doc.setTextColor(opts.accent ? 79 : 24, opts.accent ? 70 : 24, opts.accent ? 229 : 27)
    doc.text(value, x + 5, y + h - (opts.delta ? 15 : 8), { maxWidth: w - 10 })
    if (opts.delta) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5)
      doc.setTextColor(...(opts.delta.positive ? [16, 150, 80] as [number, number, number] : [220, 38, 38] as [number, number, number]))
      doc.text(opts.delta.label, x + 5, y + h - 5, { maxWidth: w - 10 })
    }
  }

  // Cover
  doc.setFillColor(9, 9, 11)
  doc.rect(0, 0, pageW, pageH, 'F')
  const wordmarkDataUrl = await loadImageAsDataUrl('/brand/wordmark.png')
  if (wordmarkDataUrl) {
    // Source is 1374x393 (~3.5:1) — hold that ratio so it isn't stretched.
    const wmWidth = 46
    const wmHeight = wmWidth * (393 / 1374)
    doc.addImage(wordmarkDataUrl, 'PNG', margin + 8, 30, wmWidth, wmHeight)
  }
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

  // Page 2: full-page KPI card grid (presentation view — vs-previous-period
  // deltas show inline on the relevant cards instead of a separate table).
  doc.addPage()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(16); doc.setTextColor(24, 24, 27)
  doc.text('Laporan Penjualan POS', margin, 16)
  doc.setFontSize(9); doc.setTextColor(82, 82, 91)
  doc.text(`${clean(d.outletName)}  |  ${clean(d.periodLabel)}  |  Dibuat ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, margin, 22)

  const a = d.analytics
  const cards: { label: string; value: string; accent?: boolean; delta?: { label: string; positive: boolean } | null }[] = [
    { label: 'Penjualan Kotor', value: formatRp(d.summary.grossSales) },
    { label: 'Diskon', value: formatRp(d.summary.discountTotal) },
    { label: 'Pajak', value: formatRp(d.summary.taxTotal) },
    { label: 'Pembulatan', value: formatRp(d.summary.roundingTotal) },
    { label: 'Total Penjualan', value: formatRp(d.summary.netSales), accent: true, delta: a ? deltaOf(a.current.netSales, a.previous.netSales) : null },
    { label: 'Jumlah Transaksi', value: String(d.summary.orderCount), delta: a ? deltaOf(a.current.orderCount, a.previous.orderCount) : null },
    { label: 'Rata-rata Transaksi', value: formatRp(d.summary.averageTransaction), delta: a ? deltaOf(a.current.averageTransaction, a.previous.averageTransaction) : null },
    { label: 'Rata-rata Waktu / Order', value: d.summary.avgOrderPaceSeconds != null ? fmtDuration(d.summary.avgOrderPaceSeconds) : '-' },
    { label: 'Transaksi Dibatalkan', value: `${d.summary.voidedCount} (${formatRp(d.summary.voidedAmount)})` },
    { label: 'Komplimen', value: formatRp(d.summary.compTotal) },
  ]
  const cols = 5
  const gutter = 6
  const gridTop = 32
  const gridBottom = pageH - margin
  const cardW = (pageW - margin * 2 - gutter * (cols - 1)) / cols
  const rows = Math.ceil(cards.length / cols)
  const cardH = Math.min(60, (gridBottom - gridTop - gutter * (rows - 1)) / rows)
  const gridH = rows * cardH + (rows - 1) * gutter
  const gridY = gridTop + Math.max(0, (gridBottom - gridTop - gridH) / 2)
  cards.forEach((c, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    drawKpiCard(margin + col * (cardW + gutter), gridY + row * (cardH + gutter), cardW, cardH, c.label, c.value, { accent: c.accent, delta: c.delta })
  })
  if (a) {
    doc.setFontSize(8); doc.setTextColor(113, 113, 122)
    doc.text(`Dibandingkan dengan periode sebelumnya: ${clean(a.previousLabel)}`, margin, gridY + gridH + 8)
  }

  const daily = (d.dailyBreakdown || []).filter(x => x.orderCount > 0)
  const isMultiDay = daily.length > 1

  // Perbandingan antar hari — one row per day, only meaningful for a range longer than a single day.
  if (isMultiDay) {
    doc.addPage()
    let py = heading('Perbandingan Antar Hari', 16)
    let prevNet: number | null = null
    autoTable(doc, {
      ...base, startY: py,
      head: [['Tanggal', 'Penjualan Kotor', 'Total Penjualan', 'Transaksi', 'Rata-rata Transaksi', 'Perubahan']],
      body: daily.map(day => {
        const change = prevNet != null ? pct(day.netSales, prevNet) : '-'
        prevNet = day.netSales
        return [day.dateLabel, formatRp(day.grossSales), formatRp(day.netSales), String(day.orderCount), formatRp(day.averageTransaction), change]
      }),
      columnStyles: { 1: right, 2: right, 3: right, 4: right, 5: right },
    })
  }

  // Ringkasan per hari — one full page per day with sales, top items and payment mix.
  for (const day of daily) {
    doc.addPage()
    let dy = heading(day.dateLabel, 16)
    doc.setFontSize(9); doc.setTextColor(82, 82, 91)
    doc.text(clean(d.outletName), margin, dy + 2)
    dy += 8

    const dCards = [
      { label: 'Penjualan Kotor', value: formatRp(day.grossSales) },
      { label: 'Total Penjualan', value: formatRp(day.netSales), accent: true },
      { label: 'Transaksi', value: String(day.orderCount) },
      { label: 'Rata-rata Transaksi', value: formatRp(day.averageTransaction) },
    ]
    const dCols = 4
    const dGutter = 6
    const dCardW = (pageW - margin * 2 - dGutter * (dCols - 1)) / dCols
    const dCardH = 26
    dCards.forEach((c, i) => drawKpiCard(margin + i * (dCardW + dGutter), dy, dCardW, dCardH, c.label, c.value, { accent: c.accent }))
    dy += dCardH + 10

    autoTable(doc, {
      ...base, startY: dy,
      head: [['Metode Pembayaran', 'Jumlah']],
      body: day.tenders.length > 0 ? day.tenders.map(t => [t.method, formatRp(t.amount)]) : [['Tidak ada penjualan', '-']],
      columnStyles: { 1: right }, tableWidth: 110,
    })
    autoTable(doc, {
      ...base, startY: dy, margin: { left: margin + 122, right: margin },
      head: [['Item Terlaris', 'Qty', 'Pendapatan']],
      body: day.topItems.length > 0 ? day.topItems.map(i => [i.name, String(i.qty), formatRp(i.revenue)]) : [['Tidak ada penjualan', '-', '-']],
      columnStyles: { 1: right, 2: right },
    })
  }

  // Charts captured from the on-screen dashboard
  if (d.chartsImage) {
    doc.addPage()
    const wMax = pageW - margin * 2
    const hMax = pageH - margin * 2 - 8
    // Scale by whichever dimension is more constrained so the image is
    // never stretched non-uniformly (capping only height while keeping
    // width fixed squashes it — this keeps the original aspect ratio).
    const scale = Math.min(wMax / d.chartsImage.width, hMax / d.chartsImage.height)
    const w = d.chartsImage.width * scale
    const h = d.chartsImage.height * scale
    doc.setFontSize(11); doc.setTextColor(24, 24, 27); doc.text('Grafik', margin, 14)
    doc.addImage(d.chartsImage.dataUrl, 'PNG', margin + (wMax - w) / 2, 18, w, h)
  }

  // Tables
  doc.addPage()
  let y = heading('Metode Pembayaran', 16)
  autoTable(doc, { ...base, startY: y, head: [['Metode', 'Jumlah']], body: d.summary.tenders.map(t => [t.method, formatRp(t.amount)]), columnStyles: { 1: right }, tableWidth: 110 })
  autoTable(doc, { ...base, startY: y, margin: { left: margin + 122, right: margin }, head: [['Kategori', 'Qty', 'Pendapatan']], body: d.summary.categoryBreakdown.map(c => [c.category, String(c.qty), formatRp(c.revenue)]), columnStyles: { 1: right, 2: right } })
  y = heading('Item Terlaris', lastY() + 8)
  autoTable(doc, { ...base, startY: y, head: [['Item', 'Qty', 'Pendapatan']], body: d.summary.topItems.map(i => [i.name, String(i.qty), formatRp(i.revenue)]), columnStyles: { 1: right, 2: right } })

  if (d.analytics) {
    y = heading('Performa Kasir', lastY() + 8)
    autoTable(doc, { ...base, startY: y, head: [['Kasir', 'Transaksi', 'Penjualan', 'Rata-rata', 'Diskon', 'Void']], body: d.analytics.cashiers.map(c => [c.name, String(c.orders), formatRp(c.sales), formatRp(c.averageTransaction), formatRp(c.discount), String(c.voided)]), columnStyles: { 1: right, 2: right, 3: right, 4: right, 5: right } })

    doc.addPage()
    y = heading('Penjualan Hari x Jam (warna lebih pekat = lebih ramai)', 16)
    const max = Math.max(1, ...d.analytics.heatmapSales.flat())
    autoTable(doc, {
      ...base, startY: y, styles: { fontSize: 6, cellPadding: 1, halign: 'center' },
      head: [['', ...Array.from({ length: 24 }, (_, h) => String(h))]],
      body: d.analytics.heatmapSales.map((row, i) => [DAYS[i], ...row.map(v => (v > 0 ? String(Math.round(v / 1000)) : ''))]),
      didParseCell: (data: any) => {
        if (data.section !== 'body' || data.column.index === 0) return
        const v = d.analytics!.heatmapSales[data.row.index][data.column.index - 1]
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
  // Each raw-data section opens with its own divider page so it reads as a
  // distinct chapter rather than tables tacked onto whatever page came before.
  sectionCover('Detail Item per Transaksi', `${d.itemRows.length} baris · ${clean(d.periodLabel)}`)
  doc.addPage()
  y = heading(`Detail Item per Transaksi (${d.itemRows.length} baris)`, 16)
  autoTable(doc, {
    ...base, startY: y, styles: { fontSize: 7, cellPadding: 1.2 },
    head: [['Tanggal', 'Order', 'Item', 'Kategori', 'Qty', 'Harga', 'Diskon', 'Subtotal', 'Kasir', 'Status']],
    body: d.itemRows.map(r => [stamp(r.created_at), r.order_id.slice(0, 8).toUpperCase(), r.item_name, r.category, String(r.qty), formatRp(r.unit_price), r.discount_amount > 0 ? `-${formatRp(r.discount_amount)}` : '-', formatRp(r.subtotal), r.cashier_name, statusLabel(r.status)]),
    columnStyles: { 4: right, 5: right, 6: right, 7: right },
  })

  sectionCover('Data Transaksi', `${d.saleDetails.length} transaksi · ${clean(d.periodLabel)}`)
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
  // The footer loop above leaves the "current page" on the last page —
  // reset it so the PDF opens on the cover, not wherever that loop ended.
  doc.setPage(1)
  doc.save(fileBase(d, 'pdf'))
}
