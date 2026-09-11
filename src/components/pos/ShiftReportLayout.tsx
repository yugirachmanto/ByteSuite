'use client'

import { formatRp } from '@/lib/format'
import { format } from 'date-fns'
import type { PosSalesSummary } from '@/lib/pos/salesSummary'

export interface ShiftReportOrg {
  name: string
  address: string | null
}

export interface ShiftReportOutlet {
  name: string
  address: string | null
}

export interface ShiftReportShift {
  id: string
  cashier_name: string | null
  opened_at: string
  closed_at: string | null
  opening_float: number
  closing_counted: number | null
  expected_cash: number | null
  variance: number | null
}

interface ShiftReportLayoutProps {
  shift: ShiftReportShift
  summary: PosSalesSummary
  org: ShiftReportOrg
  outlet: ShiftReportOutlet
  paperWidth: '58mm' | '80mm'
  isFinal: boolean
}

export function ShiftReportLayout({ shift, summary, org, outlet, paperWidth, isFinal }: ShiftReportLayoutProps) {
  const fontSize = paperWidth === '58mm' ? '10.5px' : '12px'
  const cashTenderAmount = summary.tenders.find(t => t.method.toLowerCase() === 'cash')?.amount || 0
  const expectedCash = isFinal && shift.expected_cash != null ? shift.expected_cash : shift.opening_float + cashTenderAmount
  const variance = isFinal ? shift.variance : null
  const varianceLabel = variance == null ? null : variance === 0 ? 'BALANCED' : variance > 0 ? 'OVER' : 'SHORT'
  const varianceColor = variance == null ? '' : variance === 0 ? 'text-emerald-700' : variance > 0 ? 'text-amber-700' : 'text-red-700'

  return (
    <>
      <div
        className="relative mx-auto bg-white text-black font-mono"
        style={{ width: paperWidth, boxSizing: 'border-box', padding: '3mm', fontSize }}
      >
        <div className="text-center mb-2">
          <p className="font-bold text-[1.15em] leading-tight">{org.name}</p>
          {(outlet.address || org.address) && (
            <p className="leading-tight whitespace-pre-line">{outlet.address || org.address}</p>
          )}
          {outlet.name && <p className="leading-tight mt-1">{outlet.name}</p>}
          <p className="font-bold text-[1.05em] mt-2">LAPORAN SHIFT ({isFinal ? 'Z' : 'X'})</p>
          {!isFinal && (
            <p className="inline-block border border-black px-2 py-0.5 mt-1 text-[0.85em] font-bold">
              PRATINJAU — SHIFT MASIH BERJALAN
            </p>
          )}
        </div>

        <Divider />

        <div className="leading-tight space-y-0.5">
          {shift.cashier_name && <Row label="Kasir" value={shift.cashier_name} />}
          <Row label="Dibuka" value={format(new Date(shift.opened_at), 'dd/MM/yyyy HH:mm')} />
          <Row label="Ditutup" value={shift.closed_at ? format(new Date(shift.closed_at), 'dd/MM/yyyy HH:mm') : 'Masih berjalan'} />
        </div>

        <Divider />

        <div className="leading-tight space-y-0.5">
          <p className="font-bold">RINGKASAN PENJUALAN</p>
          <Row label="Penjualan Kotor" value={formatRp(summary.grossSales)} />
          {summary.discountTotal > 0 && <Row label="Diskon" value={`-${formatRp(summary.discountTotal)}`} />}
          {summary.taxTotal > 0 && <Row label="Pajak" value={formatRp(summary.taxTotal)} />}
          <div className="flex justify-between font-bold pt-1">
            <span>TOTAL PENJUALAN</span>
            <span>{formatRp(summary.netSales)}</span>
          </div>
          <Row label="Jumlah Transaksi" value={String(summary.orderCount)} />
          {summary.voidedCount > 0 && (
            <Row label="Dibatalkan" value={`${summary.voidedCount} transaksi (${formatRp(summary.voidedAmount)})`} />
          )}
        </div>

        <Divider />

        <div className="leading-tight space-y-0.5">
          <p className="font-bold">METODE PEMBAYARAN</p>
          {summary.tenders.length === 0 ? (
            <p className="text-zinc-500">Belum ada transaksi</p>
          ) : (
            summary.tenders.map(t => <Row key={t.method} label={t.method} value={formatRp(t.amount)} />)
          )}
        </div>

        <Divider />

        <div className="leading-tight space-y-0.5">
          <p className="font-bold">ITEM TERLARIS</p>
          {summary.topItems.length === 0 ? (
            <p className="text-zinc-500">Belum ada transaksi</p>
          ) : (
            summary.topItems.map((item, i) => (
              <div key={i} className="flex justify-between">
                <span>{item.name} x{item.qty}</span>
                <span>{formatRp(item.revenue)}</span>
              </div>
            ))
          )}
        </div>

        <Divider />

        <div className="leading-tight space-y-0.5">
          <p className="font-bold">REKONSILIASI KAS</p>
          <Row label="Modal Awal" value={formatRp(shift.opening_float)} />
          <Row label="Penjualan Tunai" value={formatRp(cashTenderAmount)} />
          <Row label="Diharapkan" value={formatRp(expectedCash)} />
          {isFinal && (
            <>
              <Row label="Dihitung" value={formatRp(shift.closing_counted || 0)} />
              <div className={`flex justify-between font-bold pt-1 ${varianceColor}`}>
                <span>Selisih ({varianceLabel})</span>
                <span>{formatRp(Math.abs(variance || 0))}</span>
              </div>
            </>
          )}
        </div>

        <Divider />

        <div className="text-center leading-tight">
          <p>Dicetak {format(new Date(), 'dd/MM/yyyy HH:mm')}</p>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background-color: white !important; }
          @page { size: ${paperWidth} auto; margin: 0; }
        }
      `}} />
    </>
  )
}

function Divider() {
  return <div className="my-1.5 border-t border-dashed border-black" />
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}
