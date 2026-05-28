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
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'admin@bytesuite.erp',
    password: 'password123'
  })

  await supabase.auth.setSession({
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token
  })

  const { data: gl } = await supabase.from('gl_entries').select('reference_type, debit, credit')
  
  if (gl) {
    const agg = {}
    let grandDebit = 0
    let grandCredit = 0
    for (const row of gl) {
      const t = row.reference_type || 'NULL'
      if (!agg[t]) agg[t] = { debit: 0, credit: 0 }
      agg[t].debit += Number(row.debit || 0)
      agg[t].credit += Number(row.credit || 0)
      grandDebit += Number(row.debit || 0)
      grandCredit += Number(row.credit || 0)
    }
    
    console.log('--- Imbalances by Reference Type ---')
    for (const t in agg) {
      const diff = agg[t].debit - agg[t].credit
      if (Math.abs(diff) > 0.01) {
        console.log('Type: ' + t + ' | Debit: ' + agg[t].debit + ' | Credit: ' + agg[t].credit + ' | Diff: ' + diff)
      }
    }
    console.log('--- Total GL ---')
    console.log('Total Debit: ' + grandDebit)
    console.log('Total Credit: ' + grandCredit)
    console.log('Grand Diff: ' + (grandDebit - grandCredit))
  }

  await supabase.auth.signOut()
}

check()
