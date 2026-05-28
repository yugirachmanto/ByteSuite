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

  // Find all GL entries with debit or credit > 50,000,000
  const { data: debits, error: debErr } = await supabase
    .from('gl_entries')
    .select('*, chart_of_accounts(code, name)')
    .gt('debit', 50000000)

  const { data: credits, error: credErr } = await supabase
    .from('gl_entries')
    .select('*, chart_of_accounts(code, name)')
    .gt('credit', 50000000)

  console.log('\n========================================')
  console.log(`GL Entries with Debit > 50,000,000 (Count: ${debits?.length || 0})`)
  console.log('========================================')
  debits?.forEach(e => {
    console.log(`- ID: ${e.id} | Date: ${e.entry_date} | COA: ${e.chart_of_accounts?.code} (${e.chart_of_accounts?.name})`)
    console.log(`  Debit: ${e.debit.toLocaleString('id-ID')} | Credit: ${e.credit.toLocaleString('id-ID')} | Desc: ${e.description}`)
  })

  console.log('\n========================================')
  console.log(`GL Entries with Credit > 50,000,000 (Count: ${credits?.length || 0})`)
  console.log('========================================')
  credits?.forEach(e => {
    console.log(`- ID: ${e.id} | Date: ${e.entry_date} | COA: ${e.chart_of_accounts?.code} (${e.chart_of_accounts?.name})`)
    console.log(`  Debit: ${e.debit.toLocaleString('id-ID')} | Credit: ${e.credit.toLocaleString('id-ID')} | Desc: ${e.description}`)
  })

  await supabase.auth.signOut()
}

check()
