import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccess } from '@/lib/auth/canAccess'

const POS_ROLES = ['owner', 'admin', 'cashier']

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

    if (!canAccess(profile.role, POS_ROLES)) {
      return NextResponse.json({ error: 'Forbidden: your role cannot process POS transactions' }, { status: 403 })
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('pos_enabled, pos_tax_rate')
      .eq('id', profile.org_id)
      .single()

    if (org && org.pos_enabled === false) {
      return NextResponse.json({ error: 'POS is disabled for this organization' }, { status: 403 })
    }

    const payload = await request.json()
    const { outlet_id, payment_method, lines, client_request_id, shift_id: queued_shift_id, order_discount_type, order_discount_value } = payload

    // Discounts are owner/admin only. A cashier's attempt to include one
    // (whether via a tampered request or a stale client) is silently
    // dropped rather than blocking the sale — the sale still goes through,
    // just undiscounted.
    const canDiscount = canAccess(profile.role, ['owner', 'admin'])

    if (!outlet_id || !payment_method || !lines || lines.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (!client_request_id) {
      return NextResponse.json({ error: 'Missing client_request_id' }, { status: 400 })
    }

    // Verify the outlet actually belongs to the caller's org — process_pos_order is
    // SECURITY DEFINER (bypasses RLS), so this check is the only thing standing between
    // a caller and writing orders/stock/GL into another org's outlet.
    const { data: outlet } = await supabase
      .from('outlets')
      .select('id')
      .eq('id', outlet_id)
      .eq('org_id', profile.org_id)
      .single()

    if (!outlet) {
      return NextResponse.json({ error: 'Forbidden: outlet does not belong to your organization' }, { status: 403 })
    }

    // Never trust a client-supplied shift id for a live sale — look up the
    // caller's own open shift at this outlet server-side, same reasoning as
    // recalculating prices below instead of trusting the cart.
    let { data: shift } = await supabase
      .from('pos_shifts')
      .select('id')
      .eq('cashier_id', user.id)
      .eq('outlet_id', outlet_id)
      .eq('status', 'open')
      .maybeSingle()

    // Fallback for an offline-queued sale replayed after its shift has
    // since closed: the client sends the shift id it captured at the
    // moment of the original sale. Ownership is still verified (org/outlet/
    // cashier), but status is intentionally not checked — this is what lets
    // a late-arriving sale post into the shift it actually happened under.
    if (!shift && queued_shift_id) {
      const { data: originalShift } = await supabase
        .from('pos_shifts')
        .select('id')
        .eq('id', queued_shift_id)
        .eq('cashier_id', user.id)
        .eq('outlet_id', outlet_id)
        .eq('org_id', profile.org_id)
        .maybeSingle()

      shift = originalShift
    }

    if (!shift) {
      return NextResponse.json({ error: 'No open shift — open a shift before selling' }, { status: 403 })
    }

    // 1. Calculate totals securely on the backend (don't trust frontend prices entirely, but for MVP we will use the prices from the DB if possible, or accept frontend if this is a closed system). 
    // Here we will do a simple recalculation based on product_prices to be safe.
    const itemIds = lines.map((l: any) => l.item_id)
    
    const { data: prices } = await supabase
      .from('product_prices')
      .select('item_id, selling_price, estimated_hpp')
      .eq('outlet_id', outlet_id)
      .in('item_id', itemIds)

    if (!prices) {
      return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 })
    }

    const priceMap = new Map(prices.map(p => [p.item_id, p]))

    // A percent discount is clamped to [0,100] of the base amount; a fixed
    // discount is clamped to [0, base] — neither can push a line or the
    // order below zero.
    const computeDiscount = (type: string | null | undefined, value: number | null | undefined, base: number) => {
      if (!canDiscount || !type || value == null || value <= 0) return 0
      if (type === 'percent') return Math.round(base * Math.min(value, 100) / 100)
      if (type === 'fixed') return Math.min(Math.max(value, 0), base)
      return 0
    }

    let netSubtotal = 0
    const processedLines = lines.map((line: any) => {
      const priceData = priceMap.get(line.item_id)
      const unit_price = priceData?.selling_price || 0
      const line_gross = unit_price * line.qty
      const line_discount_type = canDiscount ? (line.discount_type ?? null) : null
      const line_discount_value = canDiscount ? (line.discount_value ?? null) : null
      const line_discount_amount = computeDiscount(line_discount_type, line_discount_value, line_gross)
      const line_subtotal = line_gross - line_discount_amount

      netSubtotal += line_subtotal

      return {
        item_id: line.item_id,
        qty: line.qty,
        unit_price,
        subtotal: line_subtotal,
        cogs_per_unit: priceData?.estimated_hpp || 0,
        discount_type: line_discount_type,
        discount_value: line_discount_value,
        discount_amount: line_discount_amount
      }
    })

    const orderDiscountType = canDiscount ? (order_discount_type ?? null) : null
    const orderDiscountValue = canDiscount ? (order_discount_value ?? null) : null
    const orderDiscountAmount = computeDiscount(orderDiscountType, orderDiscountValue, netSubtotal)
    const subtotal = netSubtotal - orderDiscountAmount

    const taxRate = org?.pos_tax_rate || 0
    const tax_amount = Math.round(subtotal * (taxRate / 100))
    const total_amount = subtotal + tax_amount

    // 2. Call the RPC to process the order
    const { data: orderId, error: rpcError } = await supabase.rpc('process_pos_order', {
      p_org_id: profile.org_id,
      p_outlet_id: outlet_id,
      p_cashier_id: user.id,
      p_payment_method: payment_method,
      p_subtotal: subtotal,
      p_tax_amount: tax_amount,
      p_total_amount: total_amount,
      p_lines: processedLines,
      p_shift_id: shift.id,
      p_client_request_id: client_request_id,
      p_order_discount_type: orderDiscountType,
      p_order_discount_value: orderDiscountValue,
      p_order_discount_amount: orderDiscountAmount
    })

    if (rpcError) {
      console.error('RPC Error:', rpcError)
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, order_id: orderId })

  } catch (error: any) {
    console.error('POS Checkout Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
