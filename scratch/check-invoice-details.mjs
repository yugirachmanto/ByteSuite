import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envContent = fs.readFileSync('.env.local', 'utf8')
const env = {}
envContent.split('\n').forEach(line => {
  const parts = line.split('=')
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim()
  }
})

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

async function check() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'admin@bytesuite.erp',
    password: 'password123'
  })

  if (authErr) {
    console.error('❌ Auth failed:', authErr)
    return
  }

  await supabase.auth.setSession({
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token
  })

  const unbalancedInvoiceId = 'acc4cb57-0a00-4a43-a81d-15c2bdf6c965'

  // Fetch invoice details
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', unbalancedInvoiceId)
    .single()

  if (invErr) {
    console.error('❌ Error fetching invoice:', invErr.message)
  } else {
    console.log('\n========================================')
    console.log('INVOICE METADATA')
    console.log('========================================')
    console.log(JSON.stringify(invoice, null, 2))
  }

  // Fetch invoice lines
  const { data: lines, error: lineErr } = await supabase
    .from('invoice_lines')
    .select('*, item_master(name)')
    .eq('invoice_id', unbalancedInvoiceId)

  if (lineErr) {
    console.error('❌ Error fetching invoice lines:', lineErr.message)
  } else {
    console.log('\n========================================')
    console.log('INVOICE LINES')
    console.log('========================================')
    lines.forEach(l => {
      console.log(`- Item: ${l.item_master?.name || l.description} | Qty: ${l.qty} | Price: ${l.unit_price} | Total: ${l.total} | COA ID: ${l.coa_id}`)
    })
  }

  // Let's fetch all gl_entries for this invoice
  const { data: glEntries, error: glErr } = await supabase
    .from('gl_entries')
    .select('*, chart_of_accounts(code, name)')
    .eq('reference_id', unbalancedInvoiceId)

  if (glErr) {
    console.error('❌ Error fetching GL entries:', glErr.message)
  } else {
    console.log('\n========================================')
    console.log('GL ENTRIES FOR THIS INVOICE')
    console.log('========================================')
    glEntries.forEach(g => {
      console.log(`- COA: ${g.chart_of_accounts?.code} (${g.chart_of_accounts?.name}) | Debit: ${g.debit} | Credit: ${g.credit} | ID: ${g.id}`)
    })
  }

  await supabase.auth.signOut()
}

check()
