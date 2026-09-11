import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccess } from '@/lib/auth/canAccess'

const VOID_ROLES = ['owner', 'admin', 'cashier']

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

    if (!canAccess(profile.role, VOID_ROLES)) {
      return NextResponse.json({ error: 'Forbidden: your role cannot void POS orders' }, { status: 403 })
    }

    const payload = await request.json()
    const { order_id, reason } = payload

    if (!order_id || !reason?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // The RPC is SECURITY DEFINER — confirm the order belongs to the
    // caller's org before calling it, same reasoning as checkout's outlet check.
    const { data: order } = await supabase
      .from('pos_orders')
      .select('id')
      .eq('id', order_id)
      .eq('org_id', profile.org_id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Forbidden: order does not belong to your organization' }, { status: 403 })
    }

    const { error: rpcError } = await supabase.rpc('void_pos_order', {
      p_order_id: order_id,
      p_reason: reason.trim()
    })

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('POS Void Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
