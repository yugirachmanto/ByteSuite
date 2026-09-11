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
      return NextResponse.json({ error: 'Forbidden: your role cannot open a POS shift' }, { status: 403 })
    }

    const payload = await request.json()
    const { outlet_id, opening_float, notes } = payload

    if (!outlet_id || opening_float === undefined || opening_float === null) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: outlet } = await supabase
      .from('outlets')
      .select('id')
      .eq('id', outlet_id)
      .eq('org_id', profile.org_id)
      .single()

    if (!outlet) {
      return NextResponse.json({ error: 'Forbidden: outlet does not belong to your organization' }, { status: 403 })
    }

    const { data: shiftId, error: rpcError } = await supabase.rpc('open_pos_shift', {
      p_org_id: profile.org_id,
      p_outlet_id: outlet_id,
      p_opening_float: opening_float,
      p_notes: notes || null
    })

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, shift_id: shiftId })

  } catch (error: any) {
    console.error('POS Shift Open Error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
