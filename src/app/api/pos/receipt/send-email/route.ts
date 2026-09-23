import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { formatRp } from '@/lib/format'
import { sendEmail } from '@/lib/email/openmail'
import { format } from 'date-fns'

const esc = (v: string) =>
  String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// Table-based, inline-styled markup: email clients ignore flex/grid.
function buildReceiptHtml(params: {
  orgName: string
  outletName: string
  orderId: string
  createdAt: string
  lines: { name: string; qty: number; unit_price: number; subtotal: number }[]
  totalAmount: number
  taxAmount: number
  roundingAmount?: number
  paymentMethod: string
  logoUrl?: string | null
}) {
  const { orgName, outletName, orderId, createdAt, lines, totalAmount, taxAmount, paymentMethod, logoUrl, roundingAmount } = params
  const place = esc(outletName || orgName)
  const rounding = roundingAmount && roundingAmount > 0 ? roundingAmount : 0
  const subtotal = totalAmount - taxAmount - rounding
  const orderNo = orderId.slice(0, 8).toUpperCase()

  const itemRows = lines.map((l) => `
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #f4f4f5;font-size:14px;color:#18181b;">${esc(l.name)}<br><span style="color:#71717a;font-size:12px;">${l.qty} x ${formatRp(l.unit_price)}</span></td>
          <td style="padding:8px 0;border-bottom:1px solid #f4f4f5;font-size:14px;color:#18181b;text-align:right;vertical-align:top;white-space:nowrap;">${formatRp(l.subtotal)}</td>
        </tr>`).join('')

  const sumRow = (label: string, value: string) => `
        <tr>
          <td style="padding:3px 0;font-size:14px;color:#52525b;">${label}</td>
          <td style="padding:3px 0;font-size:14px;color:#52525b;text-align:right;">${value}</td>
        </tr>`

  return `
  <div style="background:#f4f4f5;padding:24px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:420px;margin:0 auto;">
      <p style="font-size:16px;line-height:1.6;color:#18181b;margin:0 0 4px;">Halo kak 👋</p>
      <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 4px;">Terima kasih sudah berkunjung ke <strong>${place}</strong> ☕</p>
      <p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0 0 16px;">Berikut struk pembelian kakak (Order #${orderNo}).</p>

      <div style="background:#ffffff;border-radius:12px;padding:20px;border:1px solid #e4e4e7;">
        <div style="text-align:center;margin-bottom:12px;">
          ${logoUrl ? `<img src="${esc(logoUrl)}" alt="${place}" style="max-height:56px;max-width:70%;margin-bottom:8px;" />` : ''}
          <div style="font-size:17px;font-weight:700;color:#18181b;">${place}</div>
          <div style="font-size:12px;color:#71717a;margin-top:2px;">Order #${orderNo} · ${format(new Date(createdAt), 'dd/MM/yyyy HH:mm')}</div>
        </div>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border-top:1px solid #e4e4e7;">${itemRows}
        </table>

        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:10px;">${sumRow('Subtotal', formatRp(subtotal))}${taxAmount > 0 ? sumRow('Pajak', formatRp(taxAmount)) : ''}${rounding > 0 ? sumRow('Pembulatan', formatRp(rounding)) : ''}
          <tr>
            <td style="padding:10px 0 2px;font-size:16px;font-weight:700;color:#18181b;border-top:1px solid #e4e4e7;">Total</td>
            <td style="padding:10px 0 2px;font-size:16px;font-weight:700;color:#18181b;text-align:right;border-top:1px solid #e4e4e7;">${formatRp(totalAmount)}</td>
          </tr>
          <tr>
            <td colspan="2" style="padding:2px 0;font-size:12px;color:#71717a;">Dibayar via ${esc(paymentMethod)}</td>
          </tr>
        </table>
      </div>

      <p style="font-size:15px;line-height:1.6;color:#3f3f46;text-align:center;margin:16px 0 0;">Ditunggu kedatangannya kembali! 🙏</p>
    </div>
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
    const { order_id, to_email, receipt_image_base64 } = payload

    if (!order_id || !to_email?.trim()) {
      return NextResponse.json({ error: 'Missing order_id or to_email' }, { status: 400 })
    }

    const { data: order } = await supabase
      .from('pos_orders')
      .select('id, created_at, payment_method, tax_amount, rounding_amount, total_amount, org_id, outlet_id')
      .eq('id', order_id)
      .eq('org_id', profile.org_id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Forbidden: order does not belong to your organization' }, { status: 403 })
    }

    const [linesRes, orgRes, outletRes] = await Promise.all([
      supabase.from('pos_order_lines').select('qty, unit_price, subtotal, item_master(name)').eq('order_id', order_id),
      supabase.from('organizations').select('name, receipt_logo_url').eq('id', order.org_id).single(),
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
      roundingAmount: order.rounding_amount,
      paymentMethod: order.payment_method,
      logoUrl: orgRes.data?.receipt_logo_url,
    })

    // The receipt image is rasterized client-side (from the same DOM node
    // shown in the preview) and passed here as base64 — this route has no
    // browser/DOM to render one itself. Attaching it is optional: a client
    // that can't produce one (or an older client) still gets the HTML body.
    let attachment: { filename: string; data: Buffer; contentType: string } | undefined
    if (typeof receipt_image_base64 === 'string' && receipt_image_base64.length > 0) {
      const base64Data = receipt_image_base64.includes(',') ? receipt_image_base64.split(',')[1] : receipt_image_base64
      attachment = {
        filename: `struk-${order.id.slice(0, 8)}.png`,
        data: Buffer.from(base64Data, 'base64'),
        contentType: 'image/png',
      }
    }

    const result = await sendEmail({
      to: to_email.trim(),
      subject: `Struk pembelian kakak di ${outletRes.data?.name || orgRes.data?.name || 'kami'} — #${order.id.slice(0, 8).toUpperCase()}`,
      body: html,
      idempotencyKey: `receipt-${order.id}`,
      attachment,
    })

    // Best-effort: save the recipient to the customer list; never fail the send over it.
    await supabase.rpc('record_receipt_contact', { p_email: to_email.trim() }).then(() => {}, () => {})

    return NextResponse.json({ success: true, messageId: result.messageId })

  } catch (error: any) {
    console.error('Send Receipt Email Error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
