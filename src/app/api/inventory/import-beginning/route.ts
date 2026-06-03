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

    // 3. Prepare bulk operations
    const inventoryUpdates = []
    const stockLedgerInserts = []
    let totalImportValue = 0
    let importedCount = 0

    for (const row of items) {
      const code = row.item_code?.toUpperCase()
      const itemId = itemMap.get(code)
      
      if (!itemId) {
        // Skip items that cannot be found. We could return partial success or fail everything.
        // The UI should have ideally blocked this, but for backend we skip.
        console.warn(`Item code not found: ${code}`)
        continue
      }

      const qty = Number(row.qty) || 0
      const unitCost = Number(row.unit_cost) || 0
      const totalValue = qty * unitCost

      if (qty <= 0) continue

      inventoryUpdates.push({
        outlet_id: outlet_id,
        item_id: itemId,
        qty_on_hand: qty,
        inventory_value: totalValue,
        updated_at: new Date().toISOString()
      })

      stockLedgerInserts.push({
        outlet_id: outlet_id,
        item_id: itemId,
        txn_type: 'BEGINNING_BALANCE',
        qty: qty,
        unit_cost: unitCost,
        total_value: totalValue,
        reference_type: 'import',
        reference_id: null
      })

      totalImportValue += totalValue
      importedCount++
    }

    if (importedCount === 0) {
      return NextResponse.json({ error: 'No valid items found to import' }, { status: 400 })
    }

    // 4. Perform database operations
    // Note: To be fully transactional, we should use a Postgres Function (RPC).
    // Here we'll do sequential promises for MVP.
    
    const { error: invError } = await supabase
      .from('inventory_balance')
      .upsert(inventoryUpdates, { onConflict: 'outlet_id, item_id' })
    if (invError) throw invError

    const { error: ledgerError } = await supabase
      .from('stock_ledger')
      .insert(stockLedgerInserts)
    if (ledgerError) throw ledgerError

    // 5. Accounting Journal Entry (if totalValue > 0)
    if (totalImportValue > 0) {
      // Find Inventory Asset COA (1-3-00-000) and Equity COA (3-1-00-000)
      const { data: coas } = await supabase
        .from('chart_of_accounts')
        .select('id, code')
        .eq('org_id', profile.org_id)
        .in('code', ['1-3-00-000', '3-1-00-000', '1-1-001', '3-1-001'])

      let inventoryCoaId = coas?.find(c => c.code === '1-3-00-000' || c.code === '1-1-001')?.id
      let equityCoaId = coas?.find(c => c.code === '3-1-00-000' || c.code === '3-1-001')?.id

      // If they don't exist exactly, we might just search by type for fallback
      if (!equityCoaId) {
        const { data: fbEquity } = await supabase.from('chart_of_accounts').select('id').eq('org_id', profile.org_id).eq('type', 'equity').limit(1).single()
        if (fbEquity) equityCoaId = fbEquity.id
      }
      if (!inventoryCoaId) {
        const { data: fbAsset } = await supabase.from('chart_of_accounts').select('id').eq('org_id', profile.org_id).eq('type', 'asset').limit(1).single()
        if (fbAsset) inventoryCoaId = fbAsset.id
      }

      if (inventoryCoaId && equityCoaId) {
        const { data: journal, error: jErr } = await supabase.from('gl_journals').insert({
          org_id: profile.org_id,
          outlet_id: outlet_id,
          journal_number: `BEG-${Date.now()}`,
          date: new Date().toISOString(),
          description: `Beginning Inventory Import`,
          status: 'posted',
          source_system: 'inventory'
        }).select('id').single()

        if (!jErr && journal) {
          await supabase.from('gl_journal_lines').insert([
            {
              journal_id: journal.id,
              coa_id: inventoryCoaId,
              debit: totalImportValue,
              credit: 0,
              description: `Initial Stock Balance`
            },
            {
              journal_id: journal.id,
              coa_id: equityCoaId,
              debit: 0,
              credit: totalImportValue,
              description: `Opening Balance Equity`
            }
          ])
        }
      } else {
        console.warn("Could not create journal entry because required COAs are missing.")
      }
    }

    return NextResponse.json({ success: true, imported_count: importedCount })

  } catch (error: any) {
    console.error('Import error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
