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

async function list() {
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

  // Fetch all COAs
  const { data: coas, error } = await supabase
    .from('chart_of_accounts')
    .select('code, name, type')
    .order('code')

  if (error) {
    console.error('Error fetching COAs:', error.message)
  } else {
    console.log(`Found ${coas.length} COAs:`)
    coas.forEach(c => {
      console.log(`- Code: ${c.code} | Name: ${c.name} | Type: ${c.type}`)
    })
  }

  await supabase.auth.signOut()
}

list()
