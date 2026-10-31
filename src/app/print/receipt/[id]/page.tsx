'use client'

import { use, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ReceiptLayout,
  type ReceiptOrderData, type ReceiptLine, type ReceiptPayment, type ReceiptOrg, type ReceiptOutlet,
} from '@/components/pos/ReceiptLayout'
import { PRINTABLE_WIDTH, type ReceiptPaperWidth } from '@/lib/pos/printReceipt'

/**
 * Print-only page: nothing but the receipt, outside the dashboard layout.
 *
 * Earlier attempts printed the receipt from inside the POS page (new tab,
 * hidden iframe, hiding everything else with CSS) and the Android POS
 * terminal's print service still produced the whole page. Here there is
 * nothing else to print — the page IS the receipt — so it works the same no
 * matter whether the print service honours print CSS or just snapshots the
 * screen.
 *
 * Query: ?paper=58mm|80mm  ?return=/path (where to go afterwards, default /pos)
 *        ?noprint=1 (render only; for testing)
 */
const FALLBACK_CONTROLS_MS = 20_000

function safeReturnPath(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/pos'
}

export default function PrintReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: orderId } = use(params)
  const supabase = createClient()

  const [order, setOrder] = useState<ReceiptOrderData | null>(null)
  const [lines, setLines] = useState<ReceiptLine[]>([])
  const [payments, setPayments] = useState<ReceiptPayment[]>([])
  const [org, setOrg] = useState<ReceiptOrg | null>(null)
  const [outlet, setOutlet] = useState<ReceiptOutlet | null>(null)
  const [voided, setVoided] = useState(false)
  const [paper, setPaper] = useState<ReceiptPaperWidth>('58mm')
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [showControls, setShowControls] = useState(false)
  const printed = useRef(false)
  const returnTo = useRef('/pos')
  const noPrint = useRef(false)

  useEffect(() => {
    const query = new URLSearchParams(window.location.search)
    returnTo.current = safeReturnPath(query.get('return'))
    noPrint.current = query.get('noprint') === '1'
    const paperParam = query.get('paper')

    ;(async () => {
      const { data: orderData } = await supabase
        .from('pos_orders')
        .select('id, created_at, payment_method, subtotal, tax_amount, rounding_amount, total_amount, discount_amount, org_id, outlet_id, cashier_id, status')
        .eq('id', orderId)
        .single()
      if (!orderData) { setStatus('missing'); return }

      const [lineRes, paymentRes, orgRes, outletRes, cashierRes] = await Promise.all([
        supabase.from('pos_order_lines').select('id, qty, unit_price, subtotal, discount_amount, note, item_master(name)').eq('order_id', orderId),
        supabase.from('pos_order_payments').select('id, payment_method, amount, cash_received, change_due, notes').eq('order_id', orderId),
        supabase.from('organizations').select('name, address, npwp, receipt_paper_width, qris_image_url, bank_name, bank_account_number, bank_account_holder, receipt_logo_url').eq('id', orderData.org_id).single(),
        supabase.from('outlets').select('name, address').eq('id', orderData.outlet_id).single(),
        orderData.cashier_id
          ? supabase.from('user_profiles').select('full_name').eq('id', orderData.cashier_id).single()
          : Promise.resolve({ data: null }),
      ])
      if (!orgRes.data || !outletRes.data) { setStatus('missing'); return }

      setOrder({
        id: orderData.id,
        created_at: orderData.created_at,
        payment_method: orderData.payment_method,
        subtotal: orderData.subtotal,
        tax_amount: orderData.tax_amount,
        rounding_amount: orderData.rounding_amount || 0,
        total_amount: orderData.total_amount,
        discount_amount: orderData.discount_amount || 0,
        cashier_name: cashierRes.data?.full_name || null,
      })
      setLines((lineRes.data || []).map((l) => ({
        id: l.id,
        name: (Array.isArray(l.item_master) ? l.item_master[0]?.name : (l.item_master as { name: string } | null)?.name) || 'Unknown Item',
        qty: l.qty,
        unit_price: l.unit_price,
        subtotal: l.subtotal,
        discount_amount: l.discount_amount || 0,
        note: l.note || null,
      })))
      setPayments((paymentRes.data || []).map((p) => ({
        id: p.id,
        payment_method: p.payment_method,
        amount: p.amount,
        cash_received: p.cash_received,
        change_due: p.change_due,
        notes: p.notes,
      })))
      setOrg(orgRes.data)
      setOutlet(outletRes.data)
      setVoided(orderData.status === 'voided')
      setPaper(
        paperParam === '58mm' || paperParam === '80mm'
          ? paperParam
          : ((orgRes.data.receipt_paper_width as ReceiptPaperWidth) || '58mm')
      )
      setStatus('ready')
    })()
  }, [orderId, supabase])

  const goBack = () => window.location.replace(returnTo.current)

  // Print once, then return to where the cashier came from. Android WebViews
  // don't always fire `afterprint`, so also treat "page became visible again
  // after being hidden" (the print UI closing) as the end of printing.
  useEffect(() => {
    if (status !== 'ready' || printed.current || noPrint.current) return
    printed.current = true

    let hiddenSeen = false
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hiddenSeen = true
      else if (hiddenSeen) goBack()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('afterprint', goBack, { once: true })

    const waitImages = Promise.all(
      Array.from(document.images).filter(img => !img.complete).map(
        img => new Promise<void>(resolve => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        })
      )
    )
    const timer = setTimeout(async () => {
      await Promise.race([waitImages, new Promise(r => setTimeout(r, 3000))])
      window.print()
    }, 300)
    // Escape hatch if neither signal ever arrives; shown late so it is not
    // part of the page while the print UI is being generated.
    const controlsTimer = setTimeout(() => setShowControls(true), FALLBACK_CONTROLS_MS)

    return () => {
      clearTimeout(timer)
      clearTimeout(controlsTimer)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('afterprint', goBack)
    }
  }, [status])

  const printable = PRINTABLE_WIDTH[paper]

  return (
    <div id="receipt-print-page" style={{ position: 'fixed', inset: 0, zIndex: 2147483000, overflow: 'auto', background: '#fff', color: '#000' }}>
      <style dangerouslySetInnerHTML={{ __html: `
        html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
        @page { size: ${paper} auto; margin: 0; }
        #receipt-print-page .receipt-sheet { width: ${printable} !important; max-width: ${printable} !important; margin: 0 auto !important; padding: 1mm 0 !important; box-shadow: none !important; }
        @media print { .no-print { display: none !important; } }
      `}} />

      {status === 'loading' && (
        <p className="no-print" style={{ padding: 16, fontFamily: 'sans-serif', fontSize: 14 }}>Menyiapkan struk…</p>
      )}

      {status === 'missing' && (
        <div className="no-print" style={{ padding: 16, fontFamily: 'sans-serif', fontSize: 14 }}>
          <p>Struk tidak ditemukan atau Anda belum login.</p>
          <a href="/pos" style={{ color: '#4f46e5' }}>Kembali ke POS</a>
        </div>
      )}

      {status === 'ready' && order && org && outlet && (
        <>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <ReceiptLayout order={order} lines={lines} payments={payments} org={org} outlet={outlet} paperWidth={paper} voided={voided} />
          </div>
          {showControls && (
            <div className="no-print" style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: 16, fontFamily: 'sans-serif' }}>
              <button onClick={() => window.print()} style={{ padding: '10px 16px', borderRadius: 8, border: '1px solid #999' }}>Cetak lagi</button>
              <button onClick={goBack} style={{ padding: '10px 16px', borderRadius: 8, background: '#4f46e5', color: '#fff' }}>Kembali ke POS</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
