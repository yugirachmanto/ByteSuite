'use server'

import { createClient } from '@/lib/supabase/server'
import fs from 'fs'
import path from 'path'

export async function dumpDatabaseDebug() {
  const supabase = await createClient()
  
  // 1. Get current user profile
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('user_profiles').select('*').eq('id', user?.id).single()

  // 2. Try calling RPC manually and catch error
  const invoiceId = '674d05fd-6b18-463e-9306-2c0b8bcdb8ab' // the posted invoice
  const outletId = 'b8ceb9c2-5043-4ccd-b4e4-d0345f758230'
  const orgId = profile?.org_id
  
  // We'll update status back to pending to test
  await supabase.from('invoices').update({ status: 'pending' }).eq('id', invoiceId)
  
  const { data: rpcResult, error: rpcError } = await supabase.rpc('post_invoice', {
    p_invoice_id: invoiceId,
    p_outlet_id: outletId,
    p_org_id: orgId,
    p_lines: [{
      item_id: '25db9c42-b0ca-41db-84ed-57cf261e6a7c',
      qty: 1,
      unit_price: 30000,
      total_price: 30000,
      description: 'Test Line'
    }]
  })
  
  const { data: invoices } = await supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(5)
  const { data: batches } = await supabase.from('stock_batches').select('*').limit(5)
  const { data: ledger } = await supabase.from('stock_ledger').select('*').limit(5)
  const { data: balance } = await supabase.from('inventory_balance').select('*').limit(5)
  
  const debugData = {
    rpcError,
    rpcResult,
    invoices,
    batches,
    ledger,
    balance
  }
  
  fs.writeFileSync(path.join(process.cwd(), 'db-dump.json'), JSON.stringify(debugData, null, 2))
  
  return debugData
}
