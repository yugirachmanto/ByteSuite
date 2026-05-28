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

  // Fetch all COAs
  const { data: coas, error } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, parent_id, level, is_header')
    .order('code')

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  console.log(`\nALL 73 COAs IN DATABASE:`)
  console.log('----------------------------------------------------------------------------------------------------')
  console.log('CODE         | NAME                           | LEVEL | HEADER | parent_id                            | ID')
  console.log('----------------------------------------------------------------------------------------------------')
  
  const lookup = {}
  coas.forEach(c => { lookup[c.id] = c })

  coas.forEach(c => {
    const parentCode = c.parent_id ? (lookup[c.parent_id]?.code || 'NOT_FOUND') : 'NULL'
    console.log(
      `${c.code.padEnd(12)} | ${c.name.substring(0, 30).padEnd(30)} | ${String(c.level).padEnd(5)} | ${String(c.is_header).padEnd(6)} | ${parentCode.padEnd(12)} (${c.parent_id || 'null'}) | ${c.id}`
    )
  })

  await supabase.auth.signOut()
}

check()
