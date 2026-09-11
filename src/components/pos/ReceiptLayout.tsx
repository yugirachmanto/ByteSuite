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
}

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
}

export interface ReceiptOrderData {
  id: string
  created_at: string
  payment_method: string
  subtotal: number
  tax_amount: number
  total_amount: number
  cashier_name: string | null
}

interface ReceiptLayoutProps {
  order: ReceiptOrderData
  lines: ReceiptLine[]
  org: ReceiptOrg
  outlet: ReceiptOutlet
  paperWidth: '58mm' | '80mm'
}

export function ReceiptLayout({ order, lines, org, outlet, paperWidth }: ReceiptLayoutProps) {
  const isQris = order.payment_method.toLowerCase().includes('qris')
  const isTransfer = order.payment_method.toLowerCase().includes('transfer')
  const fontSize = paperWidth === '58mm' ? '10.5px' : '12px'

  return (
    <>
      <div
        className="mx-auto bg-white text-black font-mono"
        style={{ width: paperWidth, boxSizing: 'border-box', padding: '3mm', fontSize }}
      >
        <div className="text-center mb-2">
          <p className="font-bold text-[1.15em] leading-tight">{org.name}</p>
          {outlet.address || org.address ? (
            <p className="leading-tight whitespace-pre-line">{outlet.address || org.address}</p>
          ) : null}
          {org.npwp && <p className="leading-tight">NPWP: {org.npwp}</p>}
          {outlet.name && <p className="leading-tight mt-1">{outlet.name}</p>}
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
              <div className="flex justify-between">
                <span>{line.qty} x {formatRp(line.unit_price)}</span>
                <span>{formatRp(line.subtotal)}</span>
              </div>
            </div>
          ))}
        </div>

        <Divider />

        <div className="leading-tight space-y-0.5">
          <Row label="Subtotal" value={formatRp(order.subtotal)} />
          {order.tax_amount > 0 && <Row label="Pajak" value={formatRp(order.tax_amount)} />}
          <div className="flex justify-between font-bold text-[1.1em] pt-1">
            <span>TOTAL</span>
            <span>{formatRp(order.total_amount)}</span>
          </div>
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
          <p>Terima kasih atas kunjungan Anda!</p>
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
