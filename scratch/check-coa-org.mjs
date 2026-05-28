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

  // Get active user profile to find their org_id
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user.id).single()
  const orgId = profile.org_id
  console.log(`Active Org ID from profile: ${orgId}`)

  // Count COAs grouped by org_id
  const { data: coas, error: coaErr } = await supabase
    .from('chart_of_accounts')
    .select('org_id, code, name, parent_id, level, is_header')

  if (coaErr) {
    console.error('❌ Error fetching COAs:', coaErr)
    return
  }

  const orgGroups = {}
  coas.forEach(c => {
    orgGroups[c.org_id] = (orgGroups[c.org_id] || 0) + 1
  })
  console.log('\nCOA count by Org ID:', orgGroups)

  const activeCoas = coas.filter(c => c.org_id === orgId)
  console.log(`\nActive Organization COA Count: ${activeCoas.length}`)
  
  // Check if 1-6-60-010 exists in activeCoas
  const targetCoa = activeCoas.find(c => c.code === '1-6-60-010')
  console.log(`Does 1-6-60-010 exist in active Org COAs?`, targetCoa ? 'YES' : 'NO')
  if (targetCoa) {
    console.log(JSON.stringify(targetCoa, null, 2))
    
    // Find parent chain of targetCoa
    let parentId = targetCoa.parent_id
    while (parentId) {
      const parent = activeCoas.find(c => c.id === parentId)
      if (parent) {
        console.log(`  <- Parent: ${parent.code} (${parent.name}) - is_header: ${parent.is_header}`)
        parentId = parent.parent_id
      } else {
        console.log(`  <- Parent ID ${parentId} NOT FOUND in active COAs!`)
        break
      }
    }
  }

  // Check if any active COAs have parents that don't belong to the same org, or parent_ids that don't exist
  console.log('\nChecking active COA parent integrity...')
  let parentErrors = 0
  activeCoas.forEach(c => {
    if (c.parent_id) {
      const parent = activeCoas.find(p => p.id === c.parent_id)
      if (!parent) {
        parentErrors++
        console.log(`❌ Parent ID mismatch: Account ${c.code} (${c.name}) has parent_id ${c.parent_id} which does not exist in active COAs!`)
      }
    }
  })
  console.log(`Parent errors count: ${parentErrors}`)

  await supabase.auth.signOut()
}

check()
