import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('org_id, role')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    if (!['owner', 'admin', 'finance'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden: Insufficient privileges' }, { status: 403 })
    }

    const body = await request.json()
    const { outlet_id, items } = body

    if (!outlet_id || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Invalid payload: missing outlet_id or items array' }, { status: 400 })
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

    const payload = items.map((row: any) => ({
      name: row.name,
      code: row.code || '',
      unit: row.unit || '',
      pos_category: row.pos_category || '',
      selling_price: row.selling_price != null ? Number(row.selling_price) : null
    }))

    const { data: createdCount, error: rpcError } = await supabase.rpc('bulk_create_products', {
      p_org_id: profile.org_id,
      p_outlet_id: outlet_id,
      p_items: payload
    })

    if (rpcError) throw rpcError

    return NextResponse.json({ success: true, created_count: createdCount })

  } catch (error: any) {
    console.error('Bulk product upload error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
