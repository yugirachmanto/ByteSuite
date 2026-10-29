'use client'

import { formatRp } from '@/lib/format'
import { format } from 'date-fns'

export interface ReceiptOrg {
  name: string
  address: string | null
  npwp: string | null
  qris_image_url: string | null
  bank_name: string | null
  bank_account_number: string | null
  bank_account_holder: string | null
  receipt_logo_url?: string | null
  receipt_header_text?: string | null
  receipt_footer_text?: string | null
  receipt_footer_image_url?: string | null
  receipt_show_org_name?: boolean | null
  receipt_show_address?: boolean | null
  receipt_show_npwp?: boolean | null
  receipt_show_outlet_name?: boolean | null
}

export const DEFAULT_RECEIPT_FOOTER = 'Terima kasih atas kunjungan Anda!'

/** Columns to select from `organizations` to render a receipt. */
export const RECEIPT_ORG_COLUMNS =
  'name, address, npwp, receipt_paper_width, qris_image_url, bank_name, bank_account_number, bank_account_holder, receipt_logo_url, receipt_header_text, receipt_footer_text, receipt_footer_image_url, receipt_show_org_name, receipt_show_address, receipt_show_npwp, receipt_show_outlet_name'

export interface ReceiptOutlet {
  name: string
  address: string | null
}

export interface ReceiptLine {
  id: string
  name: string
  qty: number
  unit_price: number
  subtotal: number
  discount_amount: number
  note?: string | null
}

export interface ReceiptPayment {
  id: string
  payment_method: string
  amount: number
  cash_received: number | null
  change_due: number | null
  notes: string | null
}

export interface ReceiptOrderData {
  id: string
  created_at: string
  payment_method: string
  subtotal: number
  tax_amount: number
  rounding_amount?: number
  total_amount: number
  discount_amount: number
  cashier_name: string | null
}

interface ReceiptLayoutProps {
  order: ReceiptOrderData
  lines: ReceiptLine[]
  payments: ReceiptPayment[]
  org: ReceiptOrg
  outlet: ReceiptOutlet
  paperWidth: '58mm' | '80mm'
  voided?: boolean
}

export function ReceiptLayout({ order, lines, payments, org, outlet, paperWidth, voided }: ReceiptLayoutProps) {
  const isQris = payments.some(p => p.payment_method.toLowerCase().includes('qris'))
  const isTransfer = payments.some(p => p.payment_method.toLowerCase().includes('transfer'))
  const fontSize = paperWidth === '58mm' ? '10.5px' : '12px'
  const showOrgName = org.receipt_show_org_name !== false
  const showAddress = org.receipt_show_address !== false
  const showNpwp = org.receipt_show_npwp !== false
  const showOutletName = org.receipt_show_outlet_name !== false
  // order.subtotal is already net of both line-level and order-level
  // discounts (the persisted, GL-correct figure) — reconstruct the gross
  // (pre-discount) subtotal from the lines for display.
  const grossSubtotal = lines.reduce((sum, line) => sum + line.subtotal + line.discount_amount, 0)
  const totalDiscount = grossSubtotal - order.subtotal

  return (
    <>
      <div
        className="relative mx-auto bg-white text-black font-mono"
        style={{ width: paperWidth, boxSizing: 'border-box', padding: '3mm', fontSize }}
      >
        {voided && (
          <div
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden"
            aria-hidden="true"
          >
            <span
              className="font-sans font-black text-red-600/40 border-4 border-red-600/40 rounded-lg px-4 py-1 select-none"
              style={{ fontSize: paperWidth === '58mm' ? '28px' : '38px', transform: 'rotate(-20deg)' }}
            >
              VOID
            </span>
          </div>
        )}

        <div className="text-center mb-2">
          {org.receipt_logo_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={org.receipt_logo_url} alt={org.name} className="mx-auto mb-1.5" style={{ maxHeight: '14mm', maxWidth: '70%', objectFit: 'contain' }} crossOrigin="anonymous" />
          )}
          {showOrgName && <p className="font-bold text-[1.15em] leading-tight">{org.name}</p>}
          {showAddress && (outlet.address || org.address) ? (
            <p className="leading-tight whitespace-pre-line">{outlet.address || org.address}</p>
          ) : null}
          {showNpwp && org.npwp && <p className="leading-tight">NPWP: {org.npwp}</p>}
          {showOutletName && outlet.name && <p className="leading-tight mt-1">{outlet.name}</p>}
          {org.receipt_header_text?.trim() && (
            <p className="leading-tight mt-1 whitespace-pre-line">{org.receipt_header_text.trim()}</p>
          )}
        </div>

        <Divider />

        <div className="leading-tight space-y-0.5">
          <Row label="Order #" value={order.id.slice(0, 8).toUpperCase()} />
          <Row label="Tanggal" value={format(new Date(order.created_at), 'dd/MM/yyyy HH:mm')} />
          {order.cashier_name && <Row label="Kasir" value={order.cashier_name} />}
          <Row label="Bayar" value={order.payment_method} />
        </div>

        <Divider />

        <div className="space-y-1.5">
          {lines.map((line) => (
            <div key={line.id} className="leading-tight">
              <p>{line.name}</p>
              {line.note && <p className="text-[0.9em] italic text-zinc-600">Catatan: {line.note}</p>}
              <div className="flex justify-between">
                <span>{line.qty} x {formatRp(line.unit_price)}</span>
                <span>{formatRp(line.subtotal)}</span>
              </div>
              {line.discount_amount > 0 && (
                <div className="flex justify-between text-[0.9em]">
                  <span>Diskon item</span>
                  <span>-{formatRp(line.discount_amount)}</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <Divider />

        <div className="leading-tight space-y-0.5">
          <Row label="Subtotal" value={formatRp(grossSubtotal)} />
          {totalDiscount > 0 && <Row label="Diskon" value={`-${formatRp(totalDiscount)}`} />}
          {order.tax_amount > 0 && <Row label="Pajak" value={formatRp(order.tax_amount)} />}
          {(order.rounding_amount ?? 0) > 0 && <Row label="Pembulatan" value={formatRp(order.rounding_amount!)} />}
          <div className="flex justify-between font-bold text-[1.1em] pt-1">
            <span>TOTAL</span>
            <span>{formatRp(order.total_amount)}</span>
          </div>
        </div>

        <Divider />

        <div className="leading-tight space-y-0.5">
          {payments.map((p) => (
            <div key={p.id}>
              <Row label={p.payment_method} value={formatRp(p.amount)} />
              {p.notes && <p className="text-[0.9em] text-zinc-600">Catatan: {p.notes}</p>}
            </div>
          ))}
          {payments.map((p) => p.cash_received != null && (
            <div key={`${p.id}-cash`} className="space-y-0.5">
              <Row label="Tunai Diterima" value={formatRp(p.cash_received)} />
              {p.change_due != null && p.change_due > 0 && <Row label="Kembalian" value={formatRp(p.change_due)} />}
            </div>
          ))}
        </div>

        {isQris && org.qris_image_url && (
          <>
            <Divider />
            <div className="text-center">
              <p className="mb-1">Scan untuk bayar QRIS</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={org.qris_image_url} alt="QRIS" className="mx-auto" style={{ width: '35mm', height: '35mm', objectFit: 'contain' }} />
            </div>
          </>
        )}

        {isTransfer && (org.bank_name || org.bank_account_number) && (
          <>
            <Divider />
            <div className="leading-tight space-y-0.5">
              {org.bank_name && <Row label="Bank" value={org.bank_name} />}
              {org.bank_account_number && <Row label="No. Rek" value={org.bank_account_number} />}
              {org.bank_account_holder && <Row label="a.n." value={org.bank_account_holder} />}
            </div>
          </>
        )}

        <Divider />

        <div className="text-center leading-tight">
          {org.receipt_footer_image_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={org.receipt_footer_image_url} alt="" className="mx-auto mb-1.5" style={{ maxHeight: '30mm', maxWidth: '100%', objectFit: 'contain' }} crossOrigin="anonymous" />
          )}
          <p className="whitespace-pre-line">{org.receipt_footer_text?.trim() || DEFAULT_RECEIPT_FOOTER}</p>
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
