import type { Workbook, Worksheet, Borders } from 'exceljs'
import { format } from 'date-fns'
import type { SalesReportExportData } from '@/lib/pos/salesReportExport'

const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']

const C = {
  brand: 'FF4F46E5',
  ink: 'FF18181B',
  muted: 'FF71717A',
  tile: 'FFEEF2FF',
  zebra: 'FFF4F4F5',
  line: 'FFD4D4D8',
  green: 'FF059669',
  red: 'FFDC2626',
  white: 'FFFFFFFF',
}
const FONT = 'Calibri'
const MONEY = '"Rp" #,##0;[Red]-"Rp" #,##0'
const INT = '#,##0'
const DATETIME = 'dd/mm/yyyy hh:mm'
const PCT = '0.0%'

type Kind = 'text' | 'money' | 'int' | 'date' | 'pct'
interface Col { header: string; kind?: Kind; width: number }

const thin = { style: 'thin' as const, color: { argb: C.line } }
const BORDER: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin }

const fmtOf = (k?: Kind) => (k === 'money' ? MONEY : k === 'int' ? INT : k === 'date' ? DATETIME : k === 'pct' ? PCT : undefined)

/** Title band + subtitle on rows 1-2 of a sheet, spanning `span` columns. */
function titleBand(ws: Worksheet, title: string, subtitle: string, span: number) {
  ws.mergeCells(1, 1, 1, span)
  const t = ws.getCell(1, 1)
  t.value = title
  t.font = { name: FONT, size: 16, bold: true, color: { argb: C.white } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.ink } }
  t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 30
  ws.mergeCells(2, 1, 2, span)
  const s = ws.getCell(2, 1)
  s.value = subtitle
  s.font = { name: FONT, size: 10, color: { argb: C.muted } }
  s.alignment = { vertical: 'middle', indent: 1 }
  ws.getRow(2).height = 20
}

/**
 * Writes a bordered table with a coloured header, zebra rows and per-column
 * number formats. Returns the row number after the last written row.
 */
function writeTable(ws: Worksheet, startRow: number, cols: Col[], rows: (string | number | Date | null)[][], opts?: { totals?: (string | number | null)[]; filter?: boolean }) {
  const head = ws.getRow(startRow)
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1)
    cell.value = c.header
    cell.font = { name: FONT, bold: true, color: { argb: C.white } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.brand } }
    cell.alignment = { vertical: 'middle', horizontal: c.kind && c.kind !== 'text' && c.kind !== 'date' ? 'right' : 'left', wrapText: true }
    cell.border = BORDER
  })
  head.height = 22

  rows.forEach((r, ri) => {
    const row = ws.getRow(startRow + 1 + ri)
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      cell.value = r[i] as any
      cell.font = { name: FONT, size: 10 }
      cell.border = BORDER
      const nf = fmtOf(c.kind)
      if (nf) cell.numFmt = nf
      cell.alignment = { vertical: 'middle', horizontal: c.kind && c.kind !== 'text' && c.kind !== 'date' ? 'right' : 'left' }
      if (ri % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.zebra } }
    })
  })

  let end = startRow + 1 + rows.length
  if (opts?.totals) {
    const row = ws.getRow(end)
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      cell.value = opts.totals![i] as any
      cell.font = { name: FONT, size: 10, bold: true }
      cell.border = { ...BORDER, top: { style: 'medium', color: { argb: C.ink } } }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.tile } }
      const nf = fmtOf(c.kind)
      if (nf) cell.numFmt = nf
      cell.alignment = { vertical: 'middle', horizontal: c.kind && c.kind !== 'text' && c.kind !== 'date' ? 'right' : 'left' }
    })
    end += 1
  }
  if (opts?.filter && rows.length > 0) {
    ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: startRow + rows.length, column: cols.length } }
  }
  return end
}

function dataSheet(wb: Workbook, name: string, title: string, subtitle: string, cols: Col[], rows: (string | number | Date | null)[][], opts?: { totals?: (string | number | null)[]; filter?: boolean }) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 4, showGridLines: false }] })
  cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.width })
  titleBand(ws, title, subtitle, Math.max(cols.length, 3))
  writeTable(ws, 4, cols, rows, { filter: true, ...opts })
  ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
  return ws
}

const section = (ws: Worksheet, row: number, text: string, span: number) => {
  ws.mergeCells(row, 1, row, span)
  const c = ws.getCell(row, 1)
  c.value = text
  c.font = { name: FONT, size: 12, bold: true, color: { argb: C.ink } }
  c.border = { bottom: { style: 'medium', color: { argb: C.brand } } }
  ws.getRow(row).height = 22
}

export async function buildSalesReportWorkbook(d: SalesReportExportData): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'))
  const wb = new ExcelJS.Workbook()
  wb.creator = 'ByteSuite'
  wb.created = new Date()
  const sub = `${d.outletName}  |  ${d.periodLabel}  |  Dibuat ${format(new Date(), 'dd/MM/yyyy HH:mm')}`
  const s = d.summary
  const pctOf = (part: number, whole: number) => (whole > 0 ? part / whole : 0)

  // ── Dashboard ────────────────────────────────────────────────────────────
  const ds = wb.addWorksheet('Dashboard', { views: [{ showGridLines: false }] })
  ds.getColumn(1).width = 30
  for (let i = 2; i <= 8; i++) ds.getColumn(i).width = 17
  titleBand(ds, 'Laporan Penjualan POS - Dashboard Analisa', sub, 8)

  const tile = (row: number, col: number, label: string, value: number, kind: Kind) => {
    const l = ds.getCell(row, col)
    l.value = label
    l.font = { name: FONT, size: 9, color: { argb: C.muted } }
    l.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    const v = ds.getCell(row + 1, col)
    v.value = value
    v.numFmt = fmtOf(kind)!
    v.font = { name: FONT, size: 15, bold: true, color: { argb: C.brand } }
    v.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    for (const c of [l, v]) {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.tile } }
      c.border = { left: thin, right: thin, top: c === l ? thin : undefined, bottom: c === v ? thin : undefined }
    }
  }
  const tiles: [string, number, Kind][] = [
    ['TOTAL PENJUALAN', s.netSales, 'money'],
    ['JUMLAH TRANSAKSI', s.orderCount, 'int'],
    ['RATA-RATA TRANSAKSI', Math.round(s.averageTransaction), 'money'],
    ['PENJUALAN KOTOR', s.grossSales, 'money'],
    ['DISKON', s.discountTotal, 'money'],
    ['PAJAK', s.taxTotal, 'money'],
    ['PEMBULATAN', s.roundingTotal, 'money'],
    ['DIBATALKAN (JML)', s.voidedCount, 'int'],
    ['DIBATALKAN (NILAI)', s.voidedAmount, 'money'],
    ['KOMPLIMEN', s.compTotal, 'money'],
  ]
  tiles.forEach(([label, value, kind], i) => tile(i < 5 ? 4 : 7, (i % 5) + 1 + 0, label, value, kind))
  for (const r of [4, 5, 7, 8]) ds.getRow(r).height = r % 3 === 1 ? 18 : 26
  // tiles 1..5 use columns A..E; widths differ (A wider) which is fine for a tile strip.

  let r = 10
  if (d.analytics) {
    const { current: c, previous: p, previousLabel } = d.analytics
    section(ds, r, `Dibanding Periode Sebelumnya (${previousLabel})`, 8)
    const rows: (string | number | null)[][] = [
      ['Total Penjualan', c.netSales, p.netSales, p.netSales > 0 ? (c.netSales - p.netSales) / p.netSales : null],
      ['Jumlah Transaksi', c.orderCount, p.orderCount, p.orderCount > 0 ? (c.orderCount - p.orderCount) / p.orderCount : null],
      ['Rata-rata Transaksi', Math.round(c.averageTransaction), Math.round(p.averageTransaction), p.averageTransaction > 0 ? (c.averageTransaction - p.averageTransaction) / p.averageTransaction : null],
    ]
    const end = writeTable(ds, r + 1, [
      { header: 'Metrik', width: 30 }, { header: 'Sekarang', kind: 'money', width: 17 }, { header: 'Sebelumnya', kind: 'money', width: 17 }, { header: 'Perubahan', kind: 'pct', width: 17 },
    ], rows)
    // Jumlah Transaksi row is a count, not money.
    ds.getCell(r + 3, 2).numFmt = INT
    ds.getCell(r + 3, 3).numFmt = INT
    for (let i = 0; i < 3; i++) {
      const cell = ds.getCell(r + 2 + i, 4)
      const v = Number(cell.value)
      if (cell.value !== null && !Number.isNaN(v)) cell.font = { name: FONT, size: 10, bold: true, color: { argb: v >= 0 ? C.green : C.red } }
    }
    r = end + 2
  }

  section(ds, r, 'Metode Pembayaran', 8)
  const payStart = r + 2
  const payEnd = writeTable(ds, r + 1, [
    { header: 'Metode', width: 30 }, { header: 'Jumlah', kind: 'money', width: 17 }, { header: '% dari Total', kind: 'pct', width: 17 },
  ], s.tenders.map(t => [t.method, t.amount, pctOf(t.amount, s.tenders.reduce((a, b) => a + b.amount, 0))]))
  if (s.tenders.length > 0) {
    ds.addConditionalFormatting({ ref: `B${payStart}:B${payEnd - 1}`, rules: [{ type: 'dataBar', priority: 1, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FFA5B4FC' } } as any] })
  }
  r = payEnd + 1

  section(ds, r, 'Penjualan per Kategori', 8)
  const catStart = r + 2
  const catEnd = writeTable(ds, r + 1, [
    { header: 'Kategori', width: 30 }, { header: 'Qty', kind: 'int', width: 17 }, { header: 'Pendapatan', kind: 'money', width: 17 }, { header: '% dari Total', kind: 'pct', width: 17 },
  ], s.categoryBreakdown.map(cat => [cat.category, cat.qty, cat.revenue, pctOf(cat.revenue, s.netSales)]))
  if (s.categoryBreakdown.length > 0) {
    ds.addConditionalFormatting({ ref: `C${catStart}:C${catEnd - 1}`, rules: [{ type: 'dataBar', priority: 2, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FFA5B4FC' } } as any] })
  }
  r = catEnd + 1

  section(ds, r, 'Item Terlaris (Top 10)', 8)
  const topStart = r + 2
  const topEnd = writeTable(ds, r + 1, [
    { header: 'Item', width: 30 }, { header: 'Qty', kind: 'int', width: 17 }, { header: 'Pendapatan', kind: 'money', width: 17 },
  ], s.topItems.map(i => [i.name, i.qty, i.revenue]))
  if (s.topItems.length > 0) {
    ds.addConditionalFormatting({ ref: `C${topStart}:C${topEnd - 1}`, rules: [{ type: 'dataBar', priority: 3, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: 'FFA5B4FC' } } as any] })
  }
  r = topEnd + 1

  if (d.analytics) {
    section(ds, r, 'Performa Kasir', 8)
    const kEnd = writeTable(ds, r + 1, [
      { header: 'Kasir', width: 30 }, { header: 'Transaksi', kind: 'int', width: 17 }, { header: 'Penjualan', kind: 'money', width: 17 },
      { header: 'Rata-rata', kind: 'money', width: 17 }, { header: 'Diskon', kind: 'money', width: 17 }, { header: 'Void', kind: 'int', width: 17 },
    ], d.analytics.cashiers.map(k => [k.name, k.orders, k.sales, Math.round(k.averageTransaction), k.discount, k.voided]))
    r = kEnd + 1
  }

  if (d.chartsImage) {
    section(ds, r, 'Grafik', 8)
    const imgId = wb.addImage({ base64: d.chartsImage.dataUrl, extension: 'png' })
    const width = 900
    const height = Math.round((d.chartsImage.height / d.chartsImage.width) * width)
    ds.addImage(imgId, { tl: { col: 0, row: r }, ext: { width, height } })
    r += Math.ceil(height / 20) + 2
  }
  ds.pageSetup = { orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }

  // ── Data sheets ──────────────────────────────────────────────────────────
  const tenderTotal = s.tenders.reduce((a, b) => a + b.amount, 0)
  dataSheet(wb, 'Metode Bayar', 'Metode Pembayaran', sub,
    [{ header: 'Metode', width: 28 }, { header: 'Jumlah', kind: 'money', width: 20 }, { header: '% dari Total', kind: 'pct', width: 16 }],
    s.tenders.map(t => [t.method, t.amount, pctOf(t.amount, tenderTotal)]),
    { totals: ['Total', tenderTotal, tenderTotal > 0 ? 1 : 0] })

  dataSheet(wb, 'Kategori', 'Penjualan per Kategori', sub,
    [{ header: 'Kategori', width: 28 }, { header: 'Qty', kind: 'int', width: 12 }, { header: 'Pendapatan', kind: 'money', width: 20 }, { header: '% dari Total', kind: 'pct', width: 16 }],
    s.categoryBreakdown.map(c => [c.category, c.qty, c.revenue, pctOf(c.revenue, s.netSales)]),
    { totals: ['Total', s.categoryBreakdown.reduce((a, b) => a + b.qty, 0), s.categoryBreakdown.reduce((a, b) => a + b.revenue, 0), null] })

  dataSheet(wb, 'Item Terlaris', 'Item Terlaris (Top 10)', sub,
    [{ header: 'Item', width: 36 }, { header: 'Qty', kind: 'int', width: 12 }, { header: 'Pendapatan', kind: 'money', width: 20 }],
    s.topItems.map(i => [i.name, i.qty, i.revenue]))

  dataSheet(wb, 'Tren', d.trend.granularity === 'hour' ? 'Penjualan per Jam' : 'Penjualan per Hari', sub,
    [{ header: d.trend.granularity === 'hour' ? 'Jam' : 'Tanggal', width: 16 }, { header: 'Penjualan', kind: 'money', width: 20 }, { header: 'Transaksi', kind: 'int', width: 14 }],
    d.trend.points.map(p => [p.label, p.sales, p.orders]),
    { totals: ['Total', d.trend.points.reduce((a, b) => a + b.sales, 0), d.trend.points.reduce((a, b) => a + b.orders, 0)] })

  if (d.analytics) {
    const a = d.analytics
    // Heatmap: coloured with a real Excel colour scale.
    const hs = wb.addWorksheet('Hari x Jam', { views: [{ state: 'frozen', xSplit: 1, ySplit: 4, showGridLines: false }] })
    hs.getColumn(1).width = 12
    for (let i = 2; i <= 25; i++) hs.getColumn(i).width = 11
    titleBand(hs, 'Jam & Hari Tersibuk - Penjualan', sub, 25)
    writeTable(hs, 4, [{ header: 'Hari / Jam', width: 12 }, ...Array.from({ length: 24 }, (_, h) => ({ header: `${String(h).padStart(2, '0')}:00`, kind: 'money' as Kind, width: 11 }))],
      a.heatmapSales.map((row, i) => [DAYS[i], ...row]))
    hs.addConditionalFormatting({
      ref: 'B5:Y11',
      rules: [{ type: 'colorScale', priority: 1, cfvo: [{ type: 'min' }, { type: 'max' }], color: [{ argb: 'FFFFFFFF' }, { argb: 'FF4F46E5' }] } as any],
    })
    hs.getRow(4).eachCell(c => { c.alignment = { horizontal: 'center', vertical: 'middle' } })
    for (let rr = 5; rr <= 11; rr++) hs.getRow(rr).eachCell((c, ci) => { if (ci > 1) c.numFmt = '#,##0;;' })

    dataSheet(wb, 'Kasir', 'Performa Kasir', sub,
      [{ header: 'Kasir', width: 26 }, { header: 'Transaksi', kind: 'int', width: 14 }, { header: 'Penjualan', kind: 'money', width: 20 }, { header: 'Rata-rata', kind: 'money', width: 18 }, { header: 'Diskon', kind: 'money', width: 18 }, { header: 'Void', kind: 'int', width: 10 }],
      a.cashiers.map(k => [k.name, k.orders, k.sales, Math.round(k.averageTransaction), k.discount, k.voided]))

    const m = a.paymentTrend.methods
    dataSheet(wb, 'Tren Metode Bayar', 'Tren Metode Pembayaran', sub,
      [{ header: a.paymentTrend.granularity === 'hour' ? 'Jam' : 'Tanggal', width: 16 }, ...m.map(k => ({ header: k, kind: 'money' as Kind, width: 18 }))],
      a.paymentTrend.points.map(p => [p.label, ...m.map(k => Number(p[k]) || 0)]))
  }

  if (s.compRecipients.length > 0) {
    dataSheet(wb, 'Komplimen', 'Komplimen', sub,
      [{ header: 'Untuk / Alasan', width: 36 }, { header: 'Jumlah', kind: 'money', width: 20 }],
      s.compRecipients.map(x => [x.notes, x.amount]),
      { totals: ['Total', s.compTotal] })
  }

  dataSheet(wb, 'Detail Item', 'Detail Item per Transaksi', sub,
    [
      { header: 'Tanggal', kind: 'date', width: 18 }, { header: 'Order ID', width: 38 }, { header: 'Kasir', width: 18 }, { header: 'Metode Bayar', width: 16 },
      { header: 'Status', width: 10 }, { header: 'Item', width: 30 }, { header: 'Kategori', width: 16 }, { header: 'Qty', kind: 'int', width: 8 },
      { header: 'Harga Satuan', kind: 'money', width: 16 }, { header: 'Diskon', kind: 'money', width: 14 }, { header: 'Subtotal', kind: 'money', width: 16 },
    ],
    d.itemRows.map(x => [new Date(x.created_at), x.order_id, x.cashier_name, x.payment_methods, x.status === 'voided' ? 'Voided' : 'Selesai', x.item_name, x.category, x.qty, x.unit_price, x.discount_amount, x.subtotal]))

  // Last sheet: the raw transaction table, with totals for completed orders.
  const done = d.saleDetails.filter(x => x.status !== 'voided')
  const sum = (f: (x: typeof done[number]) => number) => done.reduce((a, x) => a + f(x), 0)
  dataSheet(wb, 'Data Transaksi', 'Data Transaksi', sub,
    [
      { header: 'Tanggal', kind: 'date', width: 18 }, { header: 'Order ID', width: 38 }, { header: 'Kasir', width: 18 }, { header: 'Jumlah Item', kind: 'int', width: 12 },
      { header: 'Metode Bayar', width: 16 }, { header: 'Subtotal', kind: 'money', width: 16 }, { header: 'Diskon', kind: 'money', width: 14 }, { header: 'Pajak', kind: 'money', width: 14 },
      { header: 'Pembulatan', kind: 'money', width: 14 }, { header: 'Total', kind: 'money', width: 16 }, { header: 'Status', width: 10 },
    ],
    d.saleDetails.map(x => [new Date(x.created_at), x.id, x.cashier_name, x.item_count, x.payment_methods, x.subtotal, x.discount_amount, x.tax_amount, x.rounding_amount, x.total_amount, x.status === 'voided' ? 'Voided' : 'Selesai']),
    { totals: ['Total (selesai)', null, null, sum(x => x.item_count), null, sum(x => x.subtotal), sum(x => x.discount_amount), sum(x => x.tax_amount), sum(x => x.rounding_amount), sum(x => x.total_amount), null] })

  return wb
}

export async function exportSalesReportExcel(d: SalesReportExportData, fileName: string) {
  const wb = await buildSalesReportWorkbook(d)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
