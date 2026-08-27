import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // 1. Authenticate and get org_id
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

    // Only allow owner, admin, or finance
    if (!['owner', 'admin', 'finance'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden: Insufficient privileges' }, { status: 403 })
    }

    const body = await request.json()
    const { outlet_id, items } = body

    if (!outlet_id || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'Invalid payload: missing outlet_id or items array' }, { status: 400 })
    }

    // 2. Fetch all items for this org to map codes to item IDs
    const { data: orgItems, error: itemsError } = await supabase
      .from('item_master')
      .select('id, code, name')
      .eq('org_id', profile.org_id)
      .eq('is_inventory', true)

    if (itemsError) throw itemsError

    const itemMap = new Map()
    orgItems?.forEach(i => {
      if (i.code) itemMap.set(i.code.toUpperCase(), i.id)
    })

    // 3. Resolve item codes to IDs, skipping rows that can't be matched
    const resolvedItems: { item_id: string; qty: number; unit_cost: number }[] = []
    for (const row of items) {
      const code = row.item_code?.toUpperCase()
      const itemId = itemMap.get(code)

      if (!itemId) {
        console.warn(`Item code not found: ${code}`)
        continue
      }

      const qty = Number(row.qty) || 0
      const unitCost = Number(row.unit_cost) || 0
      if (qty <= 0) continue

      resolvedItems.push({ item_id: itemId, qty, unit_cost: unitCost })
    }

    if (resolvedItems.length === 0) {
      return NextResponse.json({ error: 'No valid items found to import' }, { status: 400 })
    }

    // 4. Perform the import atomically — validates outlet ownership, and is
    // idempotent (re-running replaces the prior import for this outlet
    // instead of duplicating ledger/GL history).
    const { data: importedCount, error: rpcError } = await supabase.rpc('import_beginning_balance', {
      p_org_id: profile.org_id,
      p_outlet_id: outlet_id,
      p_items: resolvedItems
    })

    if (rpcError) throw rpcError

    return NextResponse.json({ success: true, imported_count: importedCount })

  } catch (error: any) {
    console.error('Import error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
