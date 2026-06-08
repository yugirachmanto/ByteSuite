/**
 * ByteSuite Financial Report PDF Generator — Production Edition
 * Generates a structured, professional PDF report using jsPDF + jspdf-autotable.
 * Features: multi-page table overflow, P&L statement, Balance Sheet, signature block.
 */

import { formatRp, tierLabels } from '@/lib/format'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'

// ── Types ─────────────────────────────────────────────────────────────────────
export interface PnLLineItem {
  code: string
  name: string
  depth: number
  is_header: boolean
  totalDebit: number
  totalCredit: number
}

export interface ReportData {
  orgName: string
  outletName: string
  startDate: Date
  endDate: Date
  generatedBy: string

  // KPIs
  totalPurchases: number
  inventoryValue: number
  totalTax: number
  posTaxTotal: number
  apOutstanding: number
  varianceValue: number

  // Tables
  invoices: {
    vendor: string
    invoice_no: string
    invoice_date: string
    grand_total: number
    tax_total: number
    payment_status: string
  }[]

  inventoryItems: {
    name: string
    category: string
    qty: number
    value: number
  }[]

  glSummary: {
    code: string
    name: string
    type: string
    totalDebit: number
    totalCredit: number
  }[]

  // P&L data
  pnl?: {
    revenue: PnLLineItem[]
    cogs: PnLLineItem[]
    opex: PnLLineItem[]
    da: PnLLineItem[]
    interestTax: PnLLineItem[]
    totalRevenue: number
    totalCogs: number
    grossProfit: number
    totalOpex: number
    ebitda: number
    totalDa: number
    ebit: number
    totalInterestTax: number
    netIncome: number
  }

  // Balance Sheet
  balanceSheet?: {
    totalAssets: number
    totalLiabilities: number
    totalEquity: number
  }
}

// ── Color Palette ─────────────────────────────────────────────────────────────
const C = {
  primary:     [49,  46,  129] as [number, number, number],
  primaryMid:  [99,  102, 241] as [number, number, number],
  accent:      [16,  185, 129] as [number, number, number],
  danger:      [239, 68,  68 ] as [number, number, number],
  warning:     [245, 158, 11 ] as [number, number, number],
  purple:      [139, 92,  246] as [number, number, number],
  cyan:        [6,   182, 212] as [number, number, number],
  black:       [17,  24,  39 ] as [number, number, number],
  gray700:     [55,  65,  81 ] as [number, number, number],
  gray500:     [107, 114, 128] as [number, number, number],
  gray300:     [209, 213, 219] as [number, number, number],
  gray100:     [243, 244, 246] as [number, number, number],
  white:       [255, 255, 255] as [number, number, number],
  tableHead:   [238, 242, 255] as [number, number, number],
  tableAlt:    [249, 250, 251] as [number, number, number],
  totalRow:    [224, 231, 255] as [number, number, number],
  pnlSection:  [245, 243, 255] as [number, number, number],
  pnlSubtotal: [233, 237, 255] as [number, number, number],
}

const PAGE_W   = 210
const PAGE_H   = 297
const MARGIN_L = 14
const MARGIN_R = 14
const CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

// ── Helper: Load jsPDF dynamically (avoids SSR issues) ────────────────────────
async function loadJsPDF() {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')
  return { jsPDF, autoTable }
}

// ── Draw page header (on every page after cover) ──────────────────────────────
function drawPageHeader(doc: any, data: ReportData, sectionTitle: string) {
  const periodLabel = `${format(data.startDate, 'd MMM yyyy', { locale: localeId })} – ${format(data.endDate, 'd MMM yyyy', { locale: localeId })}`

  // Top bar
  doc.setFillColor(...C.primary)
  doc.rect(0, 0, PAGE_W, 12, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...C.white)
  doc.text(data.orgName.toUpperCase(), MARGIN_L, 7.5)
  doc.setFont('helvetica', 'normal')
  doc.text(`Laporan Keuangan & Operasional  ·  ${data.outletName}  ·  ${periodLabel}`, PAGE_W - MARGIN_R, 7.5, { align: 'right' })

  // Section label below top bar
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.primaryMid)
  doc.text(sectionTitle.toUpperCase(), MARGIN_L, 19)

  // Divider line
  doc.setDrawColor(...C.gray300)
  doc.setLineWidth(0.3)
  doc.line(MARGIN_L, 21, PAGE_W - MARGIN_R, 21)
}

// ── Draw page footer ───────────────────────────────────────────────────────────
function drawPageFooter(doc: any, pageNum: number, totalPages: number) {
  const y = PAGE_H - 8
  doc.setFillColor(...C.gray100)
  doc.rect(0, PAGE_H - 12, PAGE_W, 12, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(...C.gray500)
  doc.text('ByteSuite ERP  ·  Dokumen Rahasia Perusahaan', MARGIN_L, y)
  doc.text(`Halaman ${pageNum} dari ${totalPages}`, PAGE_W - MARGIN_R, y, { align: 'right' })
  doc.text(`Dicetak: ${format(new Date(), 'dd MMM yyyy HH:mm', { locale: localeId })}`, PAGE_W / 2, y, { align: 'center' })
}

// ── Draw a KPI box ─────────────────────────────────────────────────────────────
function drawKpiBox(doc: any, x: number, y: number, w: number, h: number, label: string, value: string, color: [number, number, number]) {
  // Card background
  doc.setFillColor(...C.white)
  doc.setDrawColor(...C.gray300)
  doc.setLineWidth(0.3)
  doc.roundedRect(x, y, w, h, 2, 2, 'FD')

  // Color accent bar on left
  doc.setFillColor(...color)
  doc.roundedRect(x, y, 2.5, h, 1, 1, 'F')

  // Value
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...color)
  doc.text(value, x + w / 2, y + h / 2 - 1, { align: 'center' })

  // Label
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6.5)
  doc.setTextColor(...C.gray500)
  doc.text(label.toUpperCase(), x + w / 2, y + h / 2 + 5, { align: 'center' })
}

// ── Create didDrawPage hook for autoTable ──────────────────────────────────────
function makePageHook(data: ReportData, sectionTitle: string) {
  return function didDrawPage(hookData: any) {
    // Draw header on every page EXCEPT the very first page of this table
    // (we draw the header manually before autoTable for the first page)
    if (hookData.pageNumber > 1) {
      drawPageHeader(hookData.doc, data, sectionTitle + ' (lanjutan)')
    }
  }
}

// ── Shared table styles ───────────────────────────────────────────────────────
function baseTableStyles() {
  return {
    styles: {
      fontSize: 7.5,
      cellPadding: 3,
      textColor: C.black,
      lineColor: C.gray300,
      lineWidth: 0.2,
      overflow: 'ellipsize' as const,
    },
    headStyles: {
      fillColor: C.primary,
      textColor: C.white,
      fontStyle: 'bold' as const,
      fontSize: 7.5,
      halign: 'center' as const,
    },
    footStyles: {
      fillColor: C.totalRow,
      textColor: C.primary,
      fontStyle: 'bold' as const,
      fontSize: 8,
    },
    alternateRowStyles: { fillColor: C.tableAlt },
  }
}

// ── Section intro box ──────────────────────────────────────────────────────────
function drawIntroBox(doc: any, y: number, text: string) {
  doc.setFillColor(...C.tableHead)
  doc.setDrawColor(...C.gray300)
  doc.setLineWidth(0.2)
  doc.roundedRect(MARGIN_L, y, CONTENT_W, 12, 1.5, 1.5, 'FD')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...C.gray700)
  doc.text(text, MARGIN_L + 4, y + 7.5)
}

// ── Main export function ───────────────────────────────────────────────────────
export async function generateFinancialPDF(data: ReportData): Promise<void> {
  const { jsPDF, autoTable } = await loadJsPDF()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const periodLabel = `${format(data.startDate, 'd MMMM yyyy', { locale: localeId })} – ${format(data.endDate, 'd MMMM yyyy', { locale: localeId })}`

  // Track section names for reference
  const hasPnl = !!data.pnl
  const hasBs = !!data.balanceSheet

  // ──────────────────────────────────────────────────────────────────────────
  // PAGE 1 — COVER
  // ──────────────────────────────────────────────────────────────────────────

  // Full-page dark gradient header
  doc.setFillColor(...C.primary)
  doc.rect(0, 0, PAGE_W, 90, 'F')

  // Decorative circles
  doc.setFillColor(79, 70, 229, 0.15)
  doc.circle(PAGE_W - 20, 20, 55, 'F')
  doc.circle(20, 75, 35, 'F')

  // Company name
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(26)
  doc.setTextColor(...C.white)
  doc.text(data.orgName, MARGIN_L, 38)

  // Tagline
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(199, 210, 254)
  doc.text('Laporan Keuangan & Operasional', MARGIN_L, 47)

  // Outlet badge
  doc.setFillColor(255, 255, 255, 0.15)
  doc.roundedRect(MARGIN_L, 54, 60, 8, 2, 2, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.white)
  doc.text(`📍  ${data.outletName}`, MARGIN_L + 4, 59.2)

  // Divider
  doc.setDrawColor(199, 210, 254)
  doc.setLineWidth(0.4)
  doc.line(MARGIN_L, 68, PAGE_W - MARGIN_R, 68)

  // Period & meta
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(224, 231, 255)
  doc.text('PERIODE PELAPORAN', MARGIN_L, 75)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...C.white)
  doc.text(periodLabel, MARGIN_L, 82)

  // Right side — report date
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(224, 231, 255)
  doc.text('TANGGAL CETAK', PAGE_W - MARGIN_R, 75, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.setTextColor(...C.white)
  doc.text(format(new Date(), 'dd MMMM yyyy', { locale: localeId }), PAGE_W - MARGIN_R, 82, { align: 'right' })

  // ── Summary KPIs on cover ─────────────────────────────────────────────────
  const kpiY = 100
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C.gray700)
  doc.text('RINGKASAN EKSEKUTIF', MARGIN_L, kpiY)
  doc.setDrawColor(...C.primaryMid)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_L, kpiY + 2, MARGIN_L + 40, kpiY + 2)

  const kpiBoxW = (CONTENT_W - 8) / 3
  const kpiBoxH = 22
  const kpiBoxGap = 4

  const kpis = [
    { label: 'Total Pembelian',    value: formatRp(data.totalPurchases), color: C.primaryMid },
    { label: 'Nilai Inventori',    value: formatRp(data.inventoryValue), color: C.accent },
    { label: 'PPN Masukan (In)',   value: formatRp(data.totalTax),       color: C.warning },
    { label: 'PPN Keluaran (Out)', value: formatRp(data.posTaxTotal),    color: C.warning },
    { label: 'Hutang Dagang',      value: formatRp(data.apOutstanding),  color: C.danger },
    { label: 'Selisih Opname',     value: (data.varianceValue >= 0 ? '+' : '') + formatRp(data.varianceValue), color: data.varianceValue >= 0 ? C.accent : C.danger },
  ]

  kpis.forEach((kpi, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = MARGIN_L + col * (kpiBoxW + kpiBoxGap)
    const y = kpiY + 7 + row * (kpiBoxH + 4)
    drawKpiBox(doc, x, y, kpiBoxW, kpiBoxH, kpi.label, kpi.value, kpi.color)
  })

  // ── Table of Contents ─────────────────────────────────────────────────────
  const tocY = 165
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C.gray700)
  doc.text('DAFTAR ISI', MARGIN_L, tocY)
  doc.setDrawColor(...C.primaryMid)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_L, tocY + 2, MARGIN_L + 22, tocY + 2)

  const toc: string[][] = [
    ['1.', 'Laporan Pembelian'],
    ['2.', 'Penilaian Inventori'],
    ['3.', 'Buku Besar — Ringkasan per Akun'],
  ]
  if (hasPnl) toc.push(['4.', 'Laporan Laba Rugi (Income Statement)'])
  if (hasBs) toc.push([`${toc.length + 1}.`, 'Posisi Keuangan (Neraca / Balance Sheet)'])

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  toc.forEach(([num, title], i) => {
    const ty = tocY + 10 + i * 9
    doc.setTextColor(...C.black)
    doc.text(`${num}  ${title}`, MARGIN_L + 4, ty)
    doc.setTextColor(...C.gray500)
    doc.setDrawColor(...C.gray300)
    doc.setLineWidth(0.2)
    ;(doc as any).setLineDash([1, 2])
    doc.line(MARGIN_L + 70, ty - 1, PAGE_W - MARGIN_R - 5, ty - 1)
    ;(doc as any).setLineDash([])
  })

  // Confidential watermark
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...C.gray300)
  doc.text('KONFIDENSIAL  ·  HANYA UNTUK PENGGUNAAN INTERNAL', PAGE_W / 2, PAGE_H - 20, { align: 'center' })

  // Generated by
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...C.gray500)
  doc.text(`Dicetak oleh: ${data.generatedBy}`, MARGIN_L, PAGE_H - 15)

  // Footer cover
  doc.setFillColor(...C.primary)
  doc.rect(0, PAGE_H - 10, PAGE_W, 10, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(199, 210, 254)
  doc.text('Dibuat oleh ByteSuite ERP  ·  Sistem Manajemen Keuangan & Operasional', PAGE_W / 2, PAGE_H - 4, { align: 'center' })

  // ──────────────────────────────────────────────────────────────────────────
  // PAGE 2 — PURCHASE REPORT
  // ──────────────────────────────────────────────────────────────────────────
  doc.addPage()
  const sec1Title = '1. Laporan Pembelian'
  drawPageHeader(doc, data, sec1Title)

  const introY = 26
  drawIntroBox(doc, introY, `Periode: ${periodLabel}  |  Total Invoice: ${data.invoices.length}  |  Total Pembelian: ${formatRp(data.totalPurchases)}  |  PPN: ${formatRp(data.totalTax)}`)

  // Invoice table
  const invRows = data.invoices.map((inv, i) => [
    i + 1,
    inv.vendor || '—',
    inv.invoice_no || 'DRAFT',
    inv.invoice_date ? format(new Date(inv.invoice_date), 'dd/MM/yyyy') : '—',
    formatRp((inv.grand_total || 0) - (inv.tax_total || 0)),
    formatRp(inv.tax_total || 0),
    formatRp(inv.grand_total || 0),
    (inv.payment_status || 'unpaid').toUpperCase(),
  ])

  autoTable(doc, {
    startY: introY + 16,
    head: [['No', 'Vendor', 'No. Invoice', 'Tanggal', 'DPP', 'PPN', 'Total', 'Status']],
    body: invRows,
    foot: [['', '', '', 'TOTAL', formatRp(data.totalPurchases - data.totalTax), formatRp(data.totalTax), formatRp(data.totalPurchases), '']],
    margin: { left: MARGIN_L, right: MARGIN_R, bottom: 18 },
    ...baseTableStyles(),
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 38 },
      2: { cellWidth: 28, fontStyle: 'bold' },
      3: { halign: 'center', cellWidth: 20 },
      4: { halign: 'right', cellWidth: 28 },
      5: { halign: 'right', cellWidth: 22 },
      6: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
      7: { halign: 'center', cellWidth: 16 },
    },
    didDrawPage: makePageHook(data, sec1Title),
    didDrawCell: (hookData: any) => {
      if (hookData.section === 'body' && hookData.column.index === 7) {
        const status = hookData.cell.raw as string
        const isPaid = status === 'PAID'
        doc.setFillColor(...(isPaid ? [209, 250, 229] as [number,number,number] : [254, 226, 226] as [number,number,number]))
        doc.rect(hookData.cell.x + 1, hookData.cell.y + 1, hookData.cell.width - 2, hookData.cell.height - 2, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(6.5)
        doc.setTextColor(...(isPaid ? C.accent : C.danger))
        doc.text(status, hookData.cell.x + hookData.cell.width / 2, hookData.cell.y + hookData.cell.height / 2 + 0.8, { align: 'center' })
      }
    },
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PAGE 3 — INVENTORY VALUATION
  // ──────────────────────────────────────────────────────────────────────────
  doc.addPage()
  const sec2Title = '2. Penilaian Inventori'
  drawPageHeader(doc, data, sec2Title)

  const invIntroY = 26
  drawIntroBox(doc, invIntroY, `Snapshot Real-time  |  Total Item: ${data.inventoryItems.length}  |  Total Nilai: ${formatRp(data.inventoryValue)}`)

  const invRows2 = data.inventoryItems.map((item, i) => [
    i + 1,
    item.name,
    tierLabels[item.category] || item.category,
    item.qty.toLocaleString('id-ID'),
    item.qty > 0 ? formatRp(item.value / item.qty) : 'Rp 0',
    formatRp(item.value),
  ])

  autoTable(doc, {
    startY: invIntroY + 16,
    head: [['No', 'Nama Item', 'Kategori', 'Qty', 'Harga Rata-rata/unit', 'Total Nilai']],
    body: invRows2,
    foot: [['', '', '', '', 'TOTAL NILAI INVENTORI', formatRp(data.inventoryValue)]],
    margin: { left: MARGIN_L, right: MARGIN_R, bottom: 18 },
    ...baseTableStyles(),
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 65 },
      2: { cellWidth: 32 },
      3: { halign: 'right', cellWidth: 16 },
      4: { halign: 'right', cellWidth: 32 },
      5: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
    },
    didDrawPage: makePageHook(data, sec2Title),
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PAGE 4 — GL SUMMARY
  // ──────────────────────────────────────────────────────────────────────────
  doc.addPage()
  const sec3Title = '3. Buku Besar — Ringkasan per Akun'
  drawPageHeader(doc, data, sec3Title)

  const glIntroY = 26
  const totalDebits = data.glSummary.reduce((s, r) => s + r.totalDebit, 0)
  const totalCredits = data.glSummary.reduce((s, r) => s + r.totalCredit, 0)
  const isBalanced = Math.abs(totalDebits - totalCredits) < 1

  doc.setFillColor(...(isBalanced ? [209, 250, 229] as [number,number,number] : [254, 226, 226] as [number,number,number]))
  doc.setDrawColor(...C.gray300)
  doc.setLineWidth(0.2)
  doc.roundedRect(MARGIN_L, glIntroY, CONTENT_W, 12, 1.5, 1.5, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...(isBalanced ? C.accent : C.danger))
  const balanceStatus = isBalanced ? '✓  Buku Besar Seimbang (Balanced)' : '⚠  Buku Besar TIDAK Seimbang — Periksa jurnal!'
  doc.text(`${balanceStatus}   |   Total Debit: ${formatRp(totalDebits)}   |   Total Kredit: ${formatRp(totalCredits)}`, MARGIN_L + 4, glIntroY + 7.5)

  const glRows = data.glSummary.map((row, i) => [
    i + 1,
    row.code || '—',
    row.name || '—',
    (row.type || '').charAt(0).toUpperCase() + (row.type || '').slice(1),
    formatRp(row.totalDebit),
    formatRp(row.totalCredit),
    formatRp(row.totalDebit - row.totalCredit),
  ])

  autoTable(doc, {
    startY: glIntroY + 16,
    head: [['No', 'Kode', 'Nama Akun', 'Tipe', 'Total Debit', 'Total Kredit', 'Saldo']],
    body: glRows,
    foot: [['', '', '', 'TOTAL', formatRp(totalDebits), formatRp(totalCredits), formatRp(totalDebits - totalCredits)]],
    margin: { left: MARGIN_L, right: MARGIN_R, bottom: 18 },
    ...baseTableStyles(),
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'center', cellWidth: 16, fontStyle: 'bold', textColor: C.primaryMid },
      2: { cellWidth: 58 },
      3: { cellWidth: 22 },
      4: { halign: 'right', cellWidth: 28 },
      5: { halign: 'right', cellWidth: 28 },
      6: { halign: 'right', cellWidth: 22, fontStyle: 'bold' },
    },
    didDrawPage: makePageHook(data, sec3Title),
    didDrawCell: (hookData: any) => {
      if (hookData.section === 'body' && hookData.column.index === 6) {
        const val = (data.glSummary[hookData.row.index]?.totalDebit || 0) - (data.glSummary[hookData.row.index]?.totalCredit || 0)
        if (val < 0) {
          doc.setTextColor(...C.danger)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7.5)
          doc.text(formatRp(val), hookData.cell.x + hookData.cell.width - 2, hookData.cell.y + hookData.cell.height / 2 + 0.8, { align: 'right' })
        }
      }
    },
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PAGE 5 — PROFIT & LOSS STATEMENT
  // ──────────────────────────────────────────────────────────────────────────
  if (hasPnl && data.pnl) {
    doc.addPage()
    const sec4Title = '4. Laporan Laba Rugi (Income Statement)'
    drawPageHeader(doc, data, sec4Title)

    const pnl = data.pnl
    const pnlIntroY = 26
    const netColor = pnl.netIncome >= 0 ? C.accent : C.danger
    doc.setFillColor(...(pnl.netIncome >= 0 ? [209, 250, 229] as [number,number,number] : [254, 226, 226] as [number,number,number]))
    doc.setDrawColor(...C.gray300)
    doc.setLineWidth(0.2)
    doc.roundedRect(MARGIN_L, pnlIntroY, CONTENT_W, 12, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...netColor)
    doc.text(`Laba Bersih: ${formatRp(pnl.netIncome)}   |   Margin: ${pnl.totalRevenue > 0 ? ((pnl.netIncome / pnl.totalRevenue) * 100).toFixed(1) : '0'}%   |   EBITDA: ${formatRp(pnl.ebitda)}`, MARGIN_L + 4, pnlIntroY + 7.5)

    // Build P&L rows
    const pnlBody: any[][] = []

    // Helper to add a section header row
    const addSectionHeader = (label: string, color: [number, number, number]) => {
      pnlBody.push([{ content: label, colSpan: 3, styles: { fillColor: C.pnlSection, textColor: color, fontStyle: 'bold', fontSize: 8, halign: 'left' } }, ''])
    }

    // Helper to add a subtotal row
    const addSubtotalRow = (label: string, amount: number, color: [number, number, number], isBold = false) => {
      pnlBody.push([
        { content: label, colSpan: 2, styles: { fillColor: C.pnlSubtotal, textColor: color, fontStyle: 'bold', fontSize: isBold ? 9 : 8 } },
        { content: formatRp(amount), styles: { fillColor: C.pnlSubtotal, textColor: color, fontStyle: 'bold', halign: 'right', fontSize: isBold ? 9 : 8 } },
      ])
    }

    // Helper to add line items
    const addLineItems = (items: PnLLineItem[], calcBalance: (item: PnLLineItem) => number) => {
      items.forEach(item => {
        const indent = item.depth > 0 ? '    '.repeat(item.depth) : ''
        const balance = calcBalance(item)
        pnlBody.push([
          `${indent}${item.code}`,
          `${indent}${item.name}`,
          { content: balance !== 0 ? formatRp(balance) : '—', styles: { halign: 'right', fontStyle: item.is_header ? 'bold' : 'normal' } },
        ])
      })
    }

    // Revenue
    addSectionHeader('1. PENDAPATAN (REVENUE)', C.primaryMid)
    addLineItems(pnl.revenue, i => i.totalCredit - i.totalDebit)
    addSubtotalRow('Total Pendapatan Bersih', pnl.totalRevenue, C.primaryMid)

    // COGS
    addSectionHeader('2. HARGA POKOK PENJUALAN (COGS)', C.warning)
    addLineItems(pnl.cogs, i => i.totalDebit - i.totalCredit)
    addSubtotalRow('Total HPP (COGS)', pnl.totalCogs, C.warning)

    // Gross Profit
    addSubtotalRow(`LABA KOTOR (Gross Profit)  ·  Margin: ${pnl.totalRevenue > 0 ? ((pnl.grossProfit / pnl.totalRevenue) * 100).toFixed(1) : '0'}%`, pnl.grossProfit, C.black, true)

    // OPEX
    addSectionHeader('3. BEBAN OPERASIONAL (OPEX)', C.purple)
    addLineItems(pnl.opex, i => i.totalDebit - i.totalCredit)
    addSubtotalRow('Total Beban Operasional', pnl.totalOpex, C.purple)

    // EBITDA
    addSubtotalRow('EBITDA', pnl.ebitda, C.purple, true)

    // D&A
    if (pnl.da.length > 0) {
      addSectionHeader('4. PENYUSUTAN & AMORTISASI (D&A)', C.cyan)
      addLineItems(pnl.da, i => i.totalDebit - i.totalCredit)
      addSubtotalRow('Total D&A', pnl.totalDa, C.cyan)
    }

    // EBIT
    addSubtotalRow('EBIT (Laba Operasional)', pnl.ebit, C.cyan, true)

    // Interest & Tax
    if (pnl.interestTax.length > 0) {
      addSectionHeader('5. BEBAN BUNGA & PAJAK', C.danger)
      addLineItems(pnl.interestTax, i => i.totalDebit - i.totalCredit)
      addSubtotalRow('Total Bunga & Pajak', pnl.totalInterestTax, C.danger)
    }

    // Net Income
    pnlBody.push([
      { content: 'LABA BERSIH (NET INCOME)', colSpan: 2, styles: { fillColor: C.primary, textColor: C.white, fontStyle: 'bold', fontSize: 10 } },
      { content: formatRp(pnl.netIncome), styles: { fillColor: C.primary, textColor: C.white, fontStyle: 'bold', halign: 'right', fontSize: 10 } },
    ])

    autoTable(doc, {
      startY: pnlIntroY + 16,
      head: [['Kode Akun', 'Nama', 'Jumlah']],
      body: pnlBody,
      margin: { left: MARGIN_L, right: MARGIN_R, bottom: 18 },
      styles: {
        fontSize: 7.5,
        cellPadding: 3,
        textColor: C.black,
        lineColor: C.gray300,
        lineWidth: 0.15,
        overflow: 'ellipsize' as const,
      },
      headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
      alternateRowStyles: { fillColor: C.tableAlt },
      columnStyles: {
        0: { cellWidth: 30 },
        1: { cellWidth: 100 },
        2: { halign: 'right', cellWidth: 52, fontStyle: 'bold' },
      },
      didDrawPage: makePageHook(data, sec4Title),
    })
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PAGE 6 — BALANCE SHEET
  // ──────────────────────────────────────────────────────────────────────────
  if (hasBs && data.balanceSheet) {
    doc.addPage()
    const secNum = hasPnl ? 5 : 4
    const sec5Title = `${secNum}. Posisi Keuangan (Neraca)`
    drawPageHeader(doc, data, sec5Title)

    const bs = data.balanceSheet
    const bsIntroY = 26
    const isBalanceSheetOk = Math.abs(bs.totalAssets - (bs.totalLiabilities + bs.totalEquity)) < 1

    doc.setFillColor(...(isBalanceSheetOk ? [209, 250, 229] as [number,number,number] : [254, 226, 226] as [number,number,number]))
    doc.setDrawColor(...C.gray300)
    doc.setLineWidth(0.2)
    doc.roundedRect(MARGIN_L, bsIntroY, CONTENT_W, 12, 1.5, 1.5, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...(isBalanceSheetOk ? C.accent : C.danger))
    doc.text(
      isBalanceSheetOk ? '✓  Neraca Seimbang  (Aset = Kewajiban + Ekuitas)' : '⚠  Neraca TIDAK Seimbang — Periksa entri!',
      MARGIN_L + 4, bsIntroY + 7.5,
    )

    // Balance Sheet summary table
    const bsRows = [
      ['Aset (Assets)', formatRp(bs.totalAssets), { content: '', styles: {} }],
      ['Kewajiban (Liabilities)', '', formatRp(bs.totalLiabilities)],
      ['Ekuitas (Equity)', '', formatRp(bs.totalEquity)],
    ]

    autoTable(doc, {
      startY: bsIntroY + 16,
      head: [['Pos', 'Debit', 'Kredit']],
      body: bsRows,
      foot: [[
        { content: 'TOTAL', styles: { fontStyle: 'bold' } },
        { content: formatRp(bs.totalAssets), styles: { fontStyle: 'bold', halign: 'right' } },
        { content: formatRp(bs.totalLiabilities + bs.totalEquity), styles: { fontStyle: 'bold', halign: 'right' } },
      ]],
      margin: { left: MARGIN_L, right: MARGIN_R, bottom: 18 },
      ...baseTableStyles(),
      styles: { ...baseTableStyles().styles, fontSize: 10, cellPadding: 6 },
      headStyles: { ...baseTableStyles().headStyles, fontSize: 10 },
      footStyles: { ...baseTableStyles().footStyles, fontSize: 10 },
      columnStyles: {
        0: { cellWidth: 80, fontStyle: 'bold' },
        1: { halign: 'right', cellWidth: 51 },
        2: { halign: 'right', cellWidth: 51 },
      },
      didDrawPage: makePageHook(data, sec5Title),
    })

    // Visual KPI boxes below the table
    const bsTableEnd = (doc as any).lastAutoTable?.finalY + 12 || bsIntroY + 80
    if (bsTableEnd < PAGE_H - 80) {
      const bsKpiW = (CONTENT_W - 8) / 3
      drawKpiBox(doc, MARGIN_L, bsTableEnd, bsKpiW, 26, 'Total Aset', formatRp(bs.totalAssets), C.cyan)
      drawKpiBox(doc, MARGIN_L + bsKpiW + 4, bsTableEnd, bsKpiW, 26, 'Total Kewajiban', formatRp(bs.totalLiabilities), C.warning)
      drawKpiBox(doc, MARGIN_L + (bsKpiW + 4) * 2, bsTableEnd, bsKpiW, 26, 'Total Ekuitas', formatRp(bs.totalEquity), C.purple)
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SIGNATURE BLOCK (on last page)
  // ──────────────────────────────────────────────────────────────────────────
  const lastY = (doc as any).lastAutoTable?.finalY + 16 || PAGE_H - 70
  if (lastY < PAGE_H - 60) {
    doc.setDrawColor(...C.gray300)
    doc.setLineWidth(0.2)

    const sigBoxW = 55
    const sigBoxes = [
      { label: 'Dibuat oleh', name: data.generatedBy },
      { label: 'Diperiksa oleh', name: '____________________' },
      { label: 'Disetujui oleh', name: '____________________' },
    ]
    sigBoxes.forEach((box, i) => {
      const x = MARGIN_L + i * (sigBoxW + 6)
      doc.rect(x, lastY, sigBoxW, 28, 'S')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.setTextColor(...C.gray500)
      doc.text(box.label, x + sigBoxW / 2, lastY + 5, { align: 'center' })
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(...C.black)
      doc.text(box.name, x + sigBoxW / 2, lastY + 23, { align: 'center' })
      doc.setDrawColor(...C.gray500)
      doc.line(x + 6, lastY + 20, x + sigBoxW - 6, lastY + 20)
    })

    // Stamp box
    const stampX = PAGE_W - MARGIN_R - 42
    doc.setDrawColor(...C.gray300)
    doc.setLineWidth(0.3)
    ;(doc as any).setLineDash([1, 1.5])
    doc.rect(stampX, lastY, 42, 28, 'S')
    ;(doc as any).setLineDash([])
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(...C.gray500)
    doc.text('Stempel Perusahaan', stampX + 21, lastY + 5, { align: 'center' })
  }

  // ── Add page numbers to all pages ─────────────────────────────────────────
  const totalPages = doc.getNumberOfPages()
  for (let p = 2; p <= totalPages; p++) {
    doc.setPage(p)
    drawPageFooter(doc, p, totalPages)
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const filename = `Laporan-Keuangan_${data.orgName.replace(/\s+/g, '-')}_${format(data.startDate, 'yyyyMMdd')}-${format(data.endDate, 'yyyyMMdd')}.pdf`
  doc.save(filename)
}
