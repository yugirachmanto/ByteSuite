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

  let totalDebit = 0
  let totalCredit = 0
  let from = 0
  let limit = 1000
  let hasMore = true
  
  while (hasMore) {
    const { data: gl, error } = await supabase.from('gl_entries').select('debit, credit').eq('reference_type', 'invoice').range(from, from + limit - 1)
    if (error) {
      console.error(error)
      break
    }
    
    for (const row of gl) {
      totalDebit += Number(row.debit || 0)
      totalCredit += Number(row.credit || 0)
    }
    
    if (gl.length < limit) {
      hasMore = false
    } else {
      from += limit
    }
  }

  console.log('--- INVOICE GL ENTRIES ---')
  console.log('Total Debit: ' + totalDebit)
  console.log('Total Credit: ' + totalCredit)
  console.log('Difference (Debit - Credit): ' + (totalDebit - totalCredit))

  await supabase.auth.signOut()
}

check()
