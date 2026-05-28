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
      .select('debit, credit, reference_type')
      .range(from, from + step - 1)
      
    if (error) {
      console.error(error)
      break
    }
    
    if (data.length === 0) break
    
    allEntries = allEntries.concat(data)
    from += step
  }
  
  const byType = {}
  
  allEntries.forEach(e => {
    const t = e.reference_type || 'NULL'
    if (!byType[t]) byType[t] = { debit: 0, credit: 0 }
    byType[t].debit += Number(e.debit || 0)
    byType[t].credit += Number(e.credit || 0)
  })
  
  console.log('Balance by reference_type:')
  Object.keys(byType).forEach(t => {
    const diff = byType[t].debit - byType[t].credit
    console.log(`Type: ${t} | Debit: ${byType[t].debit} | Credit: ${byType[t].credit} | Diff: ${diff}`)
  })

  await supabase.auth.signOut()
}

check()
