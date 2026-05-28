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

async function verify() {
  console.log('🔑 Authenticating as admin@bytesuite.erp...')
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'admin@bytesuite.erp',
    password: 'password123'
  })

  if (authErr) {
    console.error('❌ Authentication failed:', authErr.message)
    return
  }

  console.log('✅ Auth successful! Session ID:', authData.session.user.id)
  
  // Set session on the client
  await supabase.auth.setSession({
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token
  })

  console.log('\n=== Verifying Database Records (Scoped by active user profile RLS) ===')

  // Check Invoices count
  const { count: invoicesCount, error: invErr } = await supabase.from('invoices').select('id', { count: 'exact', head: true })
  console.log('Invoices count:', invErr ? `Error: ${invErr.message}` : invoicesCount)

  // Check Item Master count
  const { count: itemsCount, error: itemErr } = await supabase.from('item_master').select('id', { count: 'exact', head: true })
  console.log('Item Master items:', itemErr ? `Error: ${itemErr.message}` : itemsCount)

  // Check GL Entries count
  const { count: glCount, error: glErr } = await supabase.from('gl_entries').select('id', { count: 'exact', head: true })
  console.log('GL Entries count:', glErr ? `Error: ${glErr.message}` : glCount)

  // Check Outlets
  const { data: outlets, error: outletErr } = await supabase.from('outlets').select('id, name')
  console.log('Outlets:', outletErr ? `Error: ${outletErr.message}` : outlets)

  // Check user profile
  const { data: profile, error: profErr } = await supabase.from('user_profiles').select('*').single()
  console.log('User Profile:', profErr ? `Error: ${profErr.message}` : profile)

  await supabase.auth.signOut()
}

verify()
