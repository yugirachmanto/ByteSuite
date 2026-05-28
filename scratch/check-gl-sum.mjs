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

  // We need to fetch all entries, so let's paginate
  let allEntries = []
  let from = 0
  let step = 1000
  while (true) {
    const { data, error } = await supabase
      .from('gl_entries')
      .select('debit, credit')
      .range(from, from + step - 1)
      
    if (error) {
      console.error(error)
      break
    }
    
    if (data.length === 0) break
    
    allEntries = allEntries.concat(data)
    from += step
  }
  
  let totalDebit = 0
  let totalCredit = 0
  
  allEntries.forEach(e => {
    totalDebit += Number(e.debit || 0)
    totalCredit += Number(e.credit || 0)
  })
  
  console.log('Total Debit:', totalDebit)
  console.log('Total Credit:', totalCredit)
  console.log('Difference:', totalDebit - totalCredit)

  await supabase.auth.signOut()
}

check()
