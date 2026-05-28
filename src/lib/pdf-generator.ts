/**
 * ByteSuite Financial Report PDF Generator
 * Generates a structured, professional PDF report using jsPDF + jspdf-autotable.
 * NOT a HTML-to-PDF conversion — pure programmatic layout.
 */

import { formatRp, tierLabels } from '@/lib/format'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'

// ── Types ─────────────────────────────────────────────────────────────────────
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
}

// ── Color Palette ─────────────────────────────────────────────────────────────
const C = {
  primary:     [49,  46,  129] as [number, number, number],   // indigo-900
  primaryMid:  [99,  102, 241] as [number, number, number],   // indigo-500
  accent:      [16,  185, 129] as [number, number, number],   // emerald-500
  danger:      [239, 68,  68 ] as [number, number, number],   // red-500
  warning:     [245, 158, 11 ] as [number, number, number],   // amber-500
  black:       [17,  24,  39 ] as [number, number, number],   // gray-900
  gray700:     [55,  65,  81 ] as [number, number, number],   // gray-700
  gray500:     [107, 114, 128] as [number, number, number],   // gray-500
  gray300:     [209, 213, 219] as [number, number, number],   // gray-300
  gray100:     [243, 244, 246] as [number, number, number],   // gray-100
  white:       [255, 255, 255] as [number, number, number],
  tableHead:   [238, 242, 255] as [number, number, number],   // indigo-50
  tableAlt:    [249, 250, 251] as [number, number, number],   // gray-50
  totalRow:    [224, 231, 255] as [number, number, number],   // indigo-100
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

// ── Main export function ───────────────────────────────────────────────────────
export async function generateFinancialPDF(data: ReportData): Promise<void> {
  const { jsPDF, autoTable } = await loadJsPDF()
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const periodLabel = `${format(data.startDate, 'd MMMM yyyy', { locale: localeId })} – ${format(data.endDate, 'd MMMM yyyy', { locale: localeId })}`

  // ──────────────────────────────────────────────────────────────────────────
  // PAGE 1 — COVER
  // ──────────────────────────────────────────────────────────────────────────

  // Full-page dark gradient header
  doc.setFillColor(...C.primary)
  doc.rect(0, 0, PAGE_W, 90, 'F')

  // Decorative circles
  doc.setFillColor(79, 70, 229, 0.15)   // semi-transparent indigo
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
  doc.setTextColor(199, 210, 254)   // indigo-200
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
  doc.setTextColor(224, 231, 255)   // indigo-100
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
    { label: 'Total Pembelian',  value: formatRp(data.totalPurchases), color: C.primaryMid },
    { label: 'Nilai Inventori',  value: formatRp(data.inventoryValue), color: C.accent },
    { label: 'PPN Masukan',      value: formatRp(data.totalTax),       color: C.warning },
    { label: 'Hutang Dagang',    value: formatRp(data.apOutstanding),  color: C.danger },
    { label: 'Total Invoice',    value: `${data.invoices.length} Dok`, color: C.primaryMid },
    { label: 'Selisih Opname',   value: (data.varianceValue >= 0 ? '+' : '') + formatRp(data.varianceValue), color: data.varianceValue >= 0 ? C.accent : C.danger },
  ]

  kpis.forEach((kpi, i) => {
    const col = i % 3
    const row = Math.floor(i / 3)
    const x = MARGIN_L + col * (kpiBoxW + kpiBoxGap)
    const y = kpiY + 7 + row * (kpiBoxH + 4)
    drawKpiBox(doc, x, y, kpiBoxW, kpiBoxH, kpi.label, kpi.value, kpi.color)
  })

  // ── Table of Contents ─────────────────────────────────────────────────────
  const tocY = 180
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...C.gray700)
  doc.text('DAFTAR ISI', MARGIN_L, tocY)
  doc.setDrawColor(...C.primaryMid)
  doc.setLineWidth(0.5)
  doc.line(MARGIN_L, tocY + 2, MARGIN_L + 22, tocY + 2)

  const toc = [
    ['1.', 'Laporan Pembelian',     'Halaman 2'],
    ['2.', 'Penilaian Inventori',   'Halaman 3'],
    ['3.', 'Buku Besar — Ringkasan per Akun', 'Halaman 4'],
  ]
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  toc.forEach(([num, title, page], i) => {
    const ty = tocY + 10 + i * 9
    doc.setTextColor(...C.black)
    doc.text(`${num}  ${title}`, MARGIN_L + 4, ty)
    doc.setTextColor(...C.gray500)
    doc.text(page, PAGE_W - MARGIN_R, ty, { align: 'right' })
    doc.setDrawColor(...C.gray300)
    doc.setLineWidth(0.2)
    ;(doc as any).setLineDash([1, 2])
    doc.line(MARGIN_L + 60, ty - 1, PAGE_W - MARGIN_R - 22, ty - 1)
    ;(doc as any).setLineDash([])
  })

  // Confidential watermark
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7)
  doc.setTextColor(...C.gray300)
  doc.text('KONFIDENSIAL  ·  HANYA UNTUK PENGGUNAAN INTERNAL', PAGE_W / 2, PAGE_H - 16, { align: 'center' })

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
  drawPageHeader(doc, data, '1. Laporan Pembelian')

  // Section intro box
  const introY = 26
  doc.setFillColor(...C.tableHead)
  doc.setDrawColor(...C.gray300)
  doc.setLineWidth(0.2)
  doc.roundedRect(MARGIN_L, introY, CONTENT_W, 12, 1.5, 1.5, 'FD')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...C.gray700)
  doc.text(`Periode: ${periodLabel}  |  Total Invoice: ${data.invoices.length}  |  Total Pembelian: ${formatRp(data.totalPurchases)}  |  PPN: ${formatRp(data.totalTax)}`, MARGIN_L + 4, introY + 7.5)

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
    styles: { fontSize: 7.5, cellPadding: 3, textColor: C.black, lineColor: C.gray300, lineWidth: 0.2 },
    headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
    footStyles: { fillColor: C.totalRow, textColor: C.primary, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: C.tableAlt },
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
    didDrawCell: (hookData: any) => {
      // Color status cell
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
  drawPageHeader(doc, data, '2. Penilaian Inventori')

  const invIntroY = 26
  doc.setFillColor(...C.tableHead)
  doc.setDrawColor(...C.gray300)
  doc.setLineWidth(0.2)
  doc.roundedRect(MARGIN_L, invIntroY, CONTENT_W, 12, 1.5, 1.5, 'FD')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...C.gray700)
  doc.text(`Snapshot Real-time  |  Total Item: ${data.inventoryItems.length}  |  Total Nilai: ${formatRp(data.inventoryValue)}`, MARGIN_L + 4, invIntroY + 7.5)

  const invRows2 = data.inventoryItems.map((item, i) => [
    i + 1,
    item.name,
    tierLabels[item.category] || item.category,
    item.qty.toString(),
    item.qty > 0 ? formatRp(item.value / item.qty) : 'Rp 0',
    formatRp(item.value),
  ])

  autoTable(doc, {
    startY: invIntroY + 16,
    head: [['No', 'Nama Item', 'Kategori', 'Qty', 'Harga Rata-rata/unit', 'Total Nilai']],
    body: invRows2,
    foot: [['', '', '', '', 'TOTAL NILAI INVENTORI', formatRp(data.inventoryValue)]],
    margin: { left: MARGIN_L, right: MARGIN_R, bottom: 18 },
    styles: { fontSize: 7.5, cellPadding: 3, textColor: C.black, lineColor: C.gray300, lineWidth: 0.2 },
    headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
    footStyles: { fillColor: C.totalRow, textColor: C.primary, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: C.tableAlt },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { cellWidth: 65 },
      2: { cellWidth: 32 },
      3: { halign: 'right', cellWidth: 16 },
      4: { halign: 'right', cellWidth: 32 },
      5: { halign: 'right', cellWidth: 28, fontStyle: 'bold' },
    },
  })

  // ──────────────────────────────────────────────────────────────────────────
  // PAGE 4 — GL SUMMARY
  // ──────────────────────────────────────────────────────────────────────────
  doc.addPage()
  drawPageHeader(doc, data, '3. Buku Besar — Ringkasan per Akun')

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
    styles: { fontSize: 7.5, cellPadding: 3, textColor: C.black, lineColor: C.gray300, lineWidth: 0.2 },
    headStyles: { fillColor: C.primary, textColor: C.white, fontStyle: 'bold', fontSize: 7.5, halign: 'center' },
    footStyles: { fillColor: C.totalRow, textColor: C.primary, fontStyle: 'bold', fontSize: 8 },
    alternateRowStyles: { fillColor: C.tableAlt },
    columnStyles: {
      0: { halign: 'center', cellWidth: 8 },
      1: { halign: 'center', cellWidth: 16, fontStyle: 'bold', textColor: C.primaryMid },
      2: { cellWidth: 58 },
      3: { cellWidth: 22 },
      4: { halign: 'right', cellWidth: 28 },
      5: { halign: 'right', cellWidth: 28 },
      6: { halign: 'right', cellWidth: 22, fontStyle: 'bold' },
    },
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

  // ── Signature block ───────────────────────────────────────────────────────
  const lastY = (doc as any).lastAutoTable?.finalY + 12 || PAGE_H - 70
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
      // Signature line
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
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p)
    if (p === 1) {
      // Cover page has its own footer, already drawn above
    } else {
      drawPageFooter(doc, p, totalPages)
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const filename = `Laporan-Keuangan_${data.orgName.replace(/\s+/g, '-')}_${format(data.startDate, 'yyyyMMdd')}-${format(data.endDate, 'yyyyMMdd')}.pdf`
  doc.save(filename)
}
