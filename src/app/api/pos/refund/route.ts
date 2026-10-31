import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccess } from '@/lib/auth/canAccess'

// Refunds move money back to a customer — same bar as discounts.
const REFUND_ROLES = ['owner', 'admin']

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single()

    if (!profile?.org_id) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 400 })
    }

    if (!canAccess(profile.role, REFUND_ROLES)) {
      return NextResponse.json({ error: 'Forbidden: only an owner or admin can refund POS orders' }, { status: 403 })
    }

    const payload = await request.json()
    const { order_id, lines, payment_method, reason } = payload

    if (
      !order_id ||
      typeof payment_method !== 'string' || !payment_method.trim() ||
      typeof reason !== 'string' || !reason.trim() ||
      !Array.isArray(lines) || lines.length === 0
    ) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const cleanLines: { order_line_id: string; qty: number }[] = []
    for (const l of lines) {
      const qty = Number(l?.qty)
      if (!l?.order_line_id || typeof l.order_line_id !== 'string' || !Number.isFinite(qty) || qty <= 0) {
        return NextResponse.json({ error: 'Invalid refund line' }, { status: 400 })
      }
      cleanLines.push({ order_line_id: l.order_line_id, qty })
    }

    // The RPC is SECURITY DEFINER and re-checks org + role itself; this
    // lookup gives a clean 403/404 and tells us which outlet's drawer to use.
    const { data: order } = await supabase
      .from('pos_orders')
      .select('id, outlet_id')
      .eq('id', order_id)
      .eq('org_id', profile.org_id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Forbidden: order does not belong to your organization' }, { status: 403 })
    }

    // Cash leaves a drawer: record the refund against an open shift at the
    // order's outlet (the caller's own if they have one, else the most recent).
    const { data: openShifts } = await supabase
      .from('pos_shifts')
      .select('id, cashier_id')
      .eq('outlet_id', order.outlet_id)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
    const shift = openShifts?.find(s => s.cashier_id === user.id) ?? openShifts?.[0]

    const { data: refundId, error: rpcError } = await supabase.rpc('refund_pos_order', {
      p_order_id: order_id,
      p_lines: cleanLines,
      p_method: payment_method.trim(),
      p_reason: reason.trim(),
      p_shift_id: shift?.id ?? null,
    })

    if (rpcError) {
      // Business-rule violations raised by the RPC (P0001) are safe and useful to show.
      const status = rpcError.code === 'P0001' ? 400 : rpcError.code === '42501' ? 403 : 500
      return NextResponse.json({ error: rpcError.message }, { status })
    }

    return NextResponse.json({ success: true, refund_id: refundId })

  } catch (error) {
    console.error('POS Refund Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
