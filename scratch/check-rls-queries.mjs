import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

// Load .env.local
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
  console.log('🔑 Authenticating as admin@bytesuite.erp...')
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'admin@bytesuite.erp',
    password: 'password123'
  })

  if (authErr) {
    console.error('❌ Authentication failed:', authErr.message)
    return
  }

  // Set session on the client
  await supabase.auth.setSession({
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token
  })

  console.log('✅ Auth successful!')

  // 1. Fetch user profile
  const { data: profile, error: profErr } = await supabase
    .from('user_profiles')
    .select('org_id, outlet_ids, role')
    .eq('id', authData.session.user.id)
    .single()
  
  console.log('\n--- 1. Profile ---')
  console.log('Error:', profErr?.message || 'none')
  console.log('Profile:', profile)

  // 2. Fetch outlets
  let query = supabase.from('outlets').select('id, name').order('name')
  if (profile?.role === 'owner') {
    query = query.eq('org_id', profile.org_id)
  } else if (profile?.outlet_ids?.length > 0) {
    query = query.in('id', profile.outlet_ids)
  }
  const { data: outlets, error: outletErr } = await query
  console.log('\n--- 2. Outlets returned to UI ---')
  console.log('Error:', outletErr?.message || 'none')
  console.log('Outlets:', outlets)

  if (!outlets || outlets.length === 0) {
    console.log('❌ No outlets returned!')
    await supabase.auth.signOut()
    return
  }

  // Let's test querying invoices for each outlet
  for (const outlet of outlets) {
    const { count, error } = await supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('outlet_id', outlet.id)

    console.log(`\n--- Invoices in "${outlet.name}" (${outlet.id}) ---`)
    console.log('Error:', error?.message || 'none')
    console.log('Count:', count)
  }

  await supabase.auth.signOut()
}

check()
