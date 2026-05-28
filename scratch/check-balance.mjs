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

  // 1. Fetch and sum all raw GL entries
  const { data: glEntries, error: glErr } = await supabase
    .from('gl_entries')
    .select('debit, credit, coa_id')

  if (glErr) {
    console.error('❌ Error fetching GL Entries:', glErr)
    return
  }

  let totalRawDebit = 0
  let totalRawCredit = 0

  glEntries.forEach(g => {
    totalRawDebit += Number(g.debit || 0)
    totalRawCredit += Number(g.credit || 0)
  })

  console.log('========================================')
  console.log('RAW GL ENTRIES BALANCE AUDIT')
  console.log('========================================')
  console.log(`Total Raw Entries: ${glEntries.length}`)
  console.log(`Sum of all RAW Debits : ${totalRawDebit}`)
  console.log(`Sum of all RAW Credits: ${totalRawCredit}`)
  console.log(`Raw Diff              : ${totalRawDebit - totalRawCredit}`)
  console.log(`Raw Is Balanced?      : ${Math.abs(totalRawDebit - totalRawCredit) < 1 ? 'YES' : 'NO'}`)

  // 2. Fetch and check COA roots
  const { data: coas, error: coaErr } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, parent_id, level, is_header')

  if (coaErr) {
    console.error('❌ Error fetching COAs:', coaErr)
    return
  }

  console.log('\n========================================')
  console.log('ROOT ACCOUNTS IN DATABASE (parent_id is null)')
  console.log('========================================')
  const roots = coas.filter(c => !c.parent_id)
  roots.forEach(r => {
    console.log(`- [Level ${r.level}] ${r.code} (${r.name}) - is_header: ${r.is_header}`)
  })

  console.log('\n========================================')
  console.log('LEVEL 1 ACCOUNTS IN DATABASE')
  console.log('========================================')
  const level1 = coas.filter(c => c.level === 1)
  level1.forEach(l => {
    console.log(`- [Parent ID: ${l.parent_id}] ${l.code} (${l.name}) - is_header: ${l.is_header}`)
  })

  await supabase.auth.signOut()
}

check()
