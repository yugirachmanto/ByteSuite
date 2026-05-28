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

  let allEntries = []
  let from = 0
  let step = 1000
  while (true) {
    const { data, error } = await supabase
      .from('gl_entries')
      .select('debit, credit, reference_type, reference_id')
      .eq('reference_type', 'invoice')
      .range(from, from + step - 1)
      
    if (error) {
      console.error(error)
      break
    }
    
    if (data.length === 0) break
    
    allEntries = allEntries.concat(data)
    from += step
  }
  
  const byInvoice = {}
  
  allEntries.forEach(e => {
    const t = e.reference_id
    if (!byInvoice[t]) byInvoice[t] = { debit: 0, credit: 0 }
    byInvoice[t].debit += Number(e.debit || 0)
    byInvoice[t].credit += Number(e.credit || 0)
  })
  
  let unbalancedInvoices = 0
  Object.keys(byInvoice).forEach(t => {
    const diff = Math.round((byInvoice[t].debit - byInvoice[t].credit) * 100) / 100
    if (Math.abs(diff) >= 0.01) {
      unbalancedInvoices++
      console.log(`Invoice: ${t} | Debit: ${byInvoice[t].debit} | Credit: ${byInvoice[t].credit} | Diff: ${diff}`)
    }
  })

  console.log('Total unbalanced invoices:', unbalancedInvoices)

  await supabase.auth.signOut()
}

check()
