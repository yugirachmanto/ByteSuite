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

  // Try to find the parent COA by ID across the ENTIRE table (bypassing org_id RLS if possible, but since we are signed in, let's see if RLS restricts us)
  const targetId = '7a20ddb5-b73f-4c88-aebd-6e30fbc3a569'
  const { data, error } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('id', targetId)
    .maybeSingle()

  if (error) {
    console.error('Error fetching parent:', error)
  } else {
    console.log(`Parent account with ID ${targetId}:`, data)
  }

  // Also let's print all parents of active accounts that were reported as mismatching
  const { data: activeCoas } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .order('code')

  const mismatches = activeCoas.filter(c => c.parent_id && !activeCoas.find(p => p.id === c.parent_id))
  console.log(`\nMismatches in table: ${mismatches.length}`)
  mismatches.slice(0, 5).forEach(c => {
    console.log(`- Account: ${c.code} (${c.name}) has parent_id ${c.parent_id}`)
  })

  await supabase.auth.signOut()
}

check()
