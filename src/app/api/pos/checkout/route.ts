import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

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
    const { outlet_id, payment_method, lines } = payload

    if (!outlet_id || !payment_method || !lines || lines.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

    let subtotal = 0
    const processedLines = lines.map((line: any) => {
      const priceData = priceMap.get(line.item_id)
      const unit_price = priceData?.selling_price || 0
      const line_subtotal = unit_price * line.qty
      subtotal += line_subtotal
      return {
        item_id: line.item_id,
        qty: line.qty,
        unit_price,
        subtotal: line_subtotal,
        cogs_per_unit: priceData?.estimated_hpp || 0
      }
    })

    const { data: orgData } = await supabase
      .from('organizations')
      .select('pos_tax_rate')
      .eq('id', profile.org_id)
      .single()

    const taxRate = orgData?.pos_tax_rate || 0
    const tax_amount = subtotal * (taxRate / 100)
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
      p_lines: processedLines
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
