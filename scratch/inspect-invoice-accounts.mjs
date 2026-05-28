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

async function inspect() {
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

  console.log('🔍 Checking recent invoices and their lines...')
  const { data: invoices, error: invErr } = await supabase
    .from('invoices')
    .select('id, invoice_no, vendor, grand_total, status')
    .order('invoice_date', { ascending: false })
    .limit(10)

  if (invErr) {
    console.error('❌ Error fetching invoices:', invErr)
  } else {
    console.log(`Fetched ${invoices.length} recent invoices:`)
    for (const inv of invoices) {
      console.log(`\nInvoice: ${inv.invoice_no} | Vendor: ${inv.vendor} | Total: ${inv.grand_total} | Status: ${inv.status} | ID: ${inv.id}`)
      
      // Fetch lines
      const { data: lines } = await supabase
        .from('invoice_lines')
        .select('id, coa_id, qty, unit_price, total, description, chart_of_accounts(code, name)')
        .eq('invoice_id', inv.id)
      
      console.log('  Invoice Lines:')
      if (lines) {
        lines.forEach(l => {
          console.log(`    - COA ID: ${l.coa_id} | Code: ${l.chart_of_accounts?.code} | Name: ${l.chart_of_accounts?.name} | Desc: ${l.description} | Total: ${l.total}`)
        })
      }

      // Fetch GL entries
      const { data: gl } = await supabase
        .from('gl_entries')
        .select('id, coa_id, debit, credit, description, chart_of_accounts(code, name)')
        .eq('reference_id', inv.id)
      
      console.log('  GL Entries:')
      if (gl) {
        gl.forEach(g => {
          console.log(`    - COA ID: ${g.coa_id} | Code: ${g.chart_of_accounts?.code} | Name: ${g.chart_of_accounts?.name} | Debit: ${g.debit} | Credit: ${g.credit} | Desc: ${g.description}`)
        })
      }
    }
  }

  console.log('\n🔍 Searching for any mention of 2-1-10-010 in all gl_entries...')
  const { data: allGl } = await supabase
    .from('gl_entries')
    .select('id, coa_id, debit, credit, description, entry_date, chart_of_accounts(code, name)')

  const matches = allGl?.filter(e => 
    e.chart_of_accounts?.code === '2-1-10-010' || 
    (e.description && e.description.includes('2-1-10-010')) ||
    e.coa_id === '2-1-10-010'
  )
  console.log(`Found ${matches?.length || 0} matches in gl_entries.`)
  if (matches && matches.length > 0) {
    matches.forEach(m => console.log(JSON.stringify(m, null, 2)))
  }

  await supabase.auth.signOut()
}

inspect()
