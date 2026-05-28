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

  const { data: orgs, error: oErr } = await supabase.from('organizations').select('*')
  console.log('Orgs:', orgs)

  const { data: coas, error } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, type, parent_id, org_id')
    .order('code')

  if (error) {
    console.error('❌ Error:', error)
  } else {
    console.log(`Total COAs in DB across all orgs: ${coas.length}`)
    const orgGroups = {}
    coas.forEach(c => {
      orgGroups[c.org_id] = (orgGroups[c.org_id] || 0) + 1
    })
    console.log('COA count by Org ID:', orgGroups)
  }

  await supabase.auth.signOut()
}

check()
