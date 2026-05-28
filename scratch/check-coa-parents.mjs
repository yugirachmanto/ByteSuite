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

  // Fetch all COAs with parent_id
  const { data: coas, error } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, parent_id')
    .order('code')

  if (error) {
    console.error('Error:', error.message)
  } else {
    const parentCount = coas.filter(c => c.parent_id).length
    console.log(`Total COAs: ${coas.length}, COAs with parent_id set: ${parentCount}`)
    
    console.log('\nSample COAs with parent_id:')
    coas.filter(c => c.parent_id).slice(0, 10).forEach(c => {
      const parent = coas.find(p => p.id === c.parent_id)
      console.log(`- Code: ${c.code} (${c.name}) -> Parent: ${parent ? parent.code : 'unknown'} (${parent ? parent.name : ''})`)
    })

    console.log('\nSample COAs without parent_id (Top level):')
    coas.filter(c => !c.parent_id).slice(0, 10).forEach(c => {
      console.log(`- Code: ${c.code} (${c.name})`)
    })
  }

  await supabase.auth.signOut()
}

check()
