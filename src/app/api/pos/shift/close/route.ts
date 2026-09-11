import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { canAccess } from '@/lib/auth/canAccess'

const SHIFT_ROLES = ['owner', 'admin', 'cashier']

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

    if (!canAccess(profile.role, SHIFT_ROLES)) {
      return NextResponse.json({ error: 'Forbidden: your role cannot close a POS shift' }, { status: 403 })
    }

    const payload = await request.json()
    const { shift_id, counted_cash, notes } = payload

    if (!shift_id || counted_cash === undefined || counted_cash === null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: shift } = await supabase
      .from('pos_shifts')
      .select('id, cashier_id')
      .eq('id', shift_id)
      .eq('org_id', profile.org_id)
      .single()

    if (!shift) {
      return NextResponse.json({ error: 'Forbidden: shift does not belong to your organization' }, { status: 403 })
    }

    if (shift.cashier_id !== user.id && !canAccess(profile.role, ['owner', 'admin'])) {
      return NextResponse.json({ error: 'Forbidden: only the shift owner or an owner/admin can close this shift' }, { status: 403 })
    }

    const { error: rpcError } = await supabase.rpc('close_pos_shift', {
      p_shift_id: shift_id,
      p_counted_cash: counted_cash,
      p_notes: notes || null
    })

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('POS Shift Close Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
