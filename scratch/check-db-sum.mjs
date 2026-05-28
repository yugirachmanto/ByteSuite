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

  // Query database aggregate sum
  const { data, error } = await supabase
    .from('gl_entries')
    .select('debit, credit')
    // We fetch in batches or use a direct SQL RPC if needed, but wait!
    // Since there are only around 1,000 or 1,200 entries, let's fetch with range to bypass the limit
  
  let allEntries = []
  let from = 0
  let to = 999
  let done = false

  while (!done) {
    const { data: chunk, error: err } = await supabase
      .from('gl_entries')
      .select('debit, credit')
      .range(from, to)

    if (err) {
      console.error('❌ Error fetching chunk:', err)
      break
    }

    allEntries = allEntries.concat(chunk)
    if (chunk.length < 1000) {
      done = true
    } else {
      from += 1000
      to += 1000
    }
  }

  let totalDebit = 0
  let totalCredit = 0

  allEntries.forEach(e => {
    totalDebit += Number(e.debit || 0)
    totalCredit += Number(e.credit || 0)
  })

  console.log('========================================')
  console.log('COMPLETE GL DATABASE BALANCE AUDIT')
  console.log('========================================')
  console.log(`Total Entries in DB  : ${allEntries.length}`)
  console.log(`Total Sum of Debits  : ${totalDebit.toLocaleString('id-ID')}`)
  console.log(`Total Sum of Credits : ${totalCredit.toLocaleString('id-ID')}`)
  console.log(`Absolute Difference  : ${(totalDebit - totalCredit).toLocaleString('id-ID')}`)
  console.log(`Is DB balanced?      : ${Math.abs(totalDebit - totalCredit) < 1 ? 'YES' : 'NO'}`)

  await supabase.auth.signOut()
}

check()
