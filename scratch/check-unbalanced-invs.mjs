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

  const { data: gl } = await supabase.from('gl_entries').select('reference_id, reference_type, debit, credit').eq('reference_type', 'invoice')
  
  if (gl) {
    const invs = {}
    for (const row of gl) {
      const id = row.reference_id || 'UNKNOWN'
      if (!invs[id]) invs[id] = { debit: 0, credit: 0 }
      invs[id].debit += Number(row.debit || 0)
      invs[id].credit += Number(row.credit || 0)
    }
    
    console.log('--- Unbalanced Invoices ---')
    let count = 0
    for (const id in invs) {
      const diff = invs[id].debit - invs[id].credit
      if (Math.abs(diff) > 0.01) {
        console.log('Invoice ' + id + ' | Debit: ' + invs[id].debit + ' | Credit: ' + invs[id].credit + ' | Diff: ' + diff)
        count++
        if (count > 20) {
           console.log('...and more')
           break
        }
      }
    }
  }

  await supabase.auth.signOut()
}

check()
