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

  // Get active user profile org_id
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('user_profiles').select('org_id, outlet_ids').eq('id', user.id).single()
  console.log('--- USER PROFILE ---')
  console.log(`User ID: ${user.id}`)
  console.log(`User Org ID: ${profile.org_id}`)
  console.log(`User Outlet IDs: ${profile.outlet_ids}`)

  // Get all unique org_ids in chart_of_accounts
  const { data: coas, error } = await supabase.from('chart_of_accounts').select('id, org_id, code, name')
  if (error) {
    console.error('Error fetching COAs:', error)
  } else {
    console.log('\n--- CHART OF ACCOUNTS STATS ---')
    console.log(`Total accounts: ${coas.length}`)
    const orgCounts = {}
    coas.forEach(c => {
      orgCounts[c.org_id] = (orgCounts[c.org_id] || 0) + 1
    })
    console.log('Unique Org IDs in COAs:', orgCounts)
  }

  // Get all unique org_ids in outlets
  const { data: outlets } = await supabase.from('outlets').select('id, org_id, name')
  console.log('\n--- OUTLETS ---')
  outlets?.forEach(o => {
    console.log(`- Outlet ID: ${o.id} | Org ID: ${o.org_id} | Name: ${o.name}`)
  })

  await supabase.auth.signOut()
}

check()
