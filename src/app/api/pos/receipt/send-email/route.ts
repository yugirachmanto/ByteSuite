import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { formatRp } from '@/lib/format'
import { sendEmail } from '@/lib/email/openmail'
import { format } from 'date-fns'

function buildReceiptHtml(params: {
  orgName: string
  outletName: string
  orderId: string
  createdAt: string
  lines: { name: string; qty: number; unit_price: number; subtotal: number }[]
  totalAmount: number
  taxAmount: number
  paymentMethod: string
}) {
  const { orgName, outletName, orderId, createdAt, lines, totalAmount, taxAmount, paymentMethod } = params
  const rows = lines.map((l) => `
    <tr>
      <td style="padding:4px 0;">${l.name}<br><span style="color:#71717a;font-size:12px;">${l.qty} x ${formatRp(l.unit_price)}</span></td>
      <td style="padding:4px 0;text-align:right;">${formatRp(l.subtotal)}</td>
    </tr>
  `).join('')

  return `
  <div style="font-family:monospace;max-width:380px;margin:0 auto;color:#18181b;">
    <div style="text-align:center;margin-bottom:12px;">
      <p style="font-weight:bold;font-size:16px;margin:0;">${orgName}</p>
      <p style="margin:2px 0 0;color:#52525b;">${outletName}</p>
    </div>
    <hr style="border:none;border-top:1px dashed #a1a1aa;margin:8px 0;" />
    <p style="margin:2px 0;">Order #${orderId.slice(0, 8).toUpperCase()}</p>
    <p style="margin:2px 0;">${format(new Date(createdAt), 'dd/MM/yyyy HH:mm')}</p>
    <hr style="border:none;border-top:1px dashed #a1a1aa;margin:8px 0;" />
    <table style="width:100%;border-collapse:collapse;">${rows}</table>
    <hr style="border:none;border-top:1px dashed #a1a1aa;margin:8px 0;" />
    ${taxAmount > 0 ? `<p style="display:flex;justify-content:space-between;margin:2px 0;">Pajak: ${formatRp(taxAmount)}</p>` : ''}
    <p style="font-weight:bold;font-size:16px;margin:6px 0;">TOTAL: ${formatRp(totalAmount)}</p>
    <p style="margin:2px 0;color:#52525b;">Dibayar via ${paymentMethod}</p>
    <hr style="border:none;border-top:1px dashed #a1a1aa;margin:8px 0;" />
    <p style="text-align:center;color:#71717a;">Terima kasih atas kunjungan Anda!</p>
  </div>
  `
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 400 })
    }

    const payload = await request.json()
    const { order_id, to_email } = payload

    if (!order_id || !to_email?.trim()) {
      return NextResponse.json({ error: 'Missing order_id or to_email' }, { status: 400 })
    }

    const { data: order } = await supabase
      .from('pos_orders')
      .select('id, created_at, payment_method, tax_amount, total_amount, org_id, outlet_id')
      .eq('id', order_id)
      .eq('org_id', profile.org_id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Forbidden: order does not belong to your organization' }, { status: 403 })
    }

    const [linesRes, orgRes, outletRes] = await Promise.all([
      supabase.from('pos_order_lines').select('qty, unit_price, subtotal, item_master(name)').eq('order_id', order_id),
      supabase.from('organizations').select('name').eq('id', order.org_id).single(),
      supabase.from('outlets').select('name').eq('id', order.outlet_id).single(),
    ])

    const lines = (linesRes.data || []).map((l: any) => ({
      name: l.item_master?.name || 'Unknown Item',
      qty: l.qty,
      unit_price: l.unit_price,
      subtotal: l.subtotal,
    }))

    const html = buildReceiptHtml({
      orgName: orgRes.data?.name || 'ByteSuite',
      outletName: outletRes.data?.name || '',
      orderId: order.id,
      createdAt: order.created_at,
      lines,
      totalAmount: order.total_amount,
      taxAmount: order.tax_amount,
      paymentMethod: order.payment_method,
    })

    const result = await sendEmail({
      to: to_email.trim(),
      subject: `Struk Pembelian ${orgRes.data?.name || ''} — #${order.id.slice(0, 8).toUpperCase()}`,
      body: html,
      idempotencyKey: `receipt-${order.id}`,
    })

    return NextResponse.json({ success: true, messageId: result.messageId })

  } catch (error: any) {
    console.error('Send Receipt Email Error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
