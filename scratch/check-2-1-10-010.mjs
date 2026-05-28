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
  const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user.id).single()
  const orgId = profile.org_id
  console.log(`User Org ID: ${orgId}`)

  // Search for COA in database
  const { data: coas, error: coaErr } = await supabase
    .from('chart_of_accounts')
    .select('*')
    .eq('code', '2-1-10-010')

  console.log('\n========================================')
  console.log('SEARCHING FOR COA 2-1-10-010 IN DATABASE')
  console.log('========================================')
  if (coaErr) {
    console.error('❌ Error fetching COA:', coaErr)
  } else {
    console.log(`Found ${coas.length} matches:`)
    coas.forEach(c => {
      console.log(JSON.stringify(c, null, 2))
    })
  }

  // Also search for any COA code starting with 2-1-10-
  const { data: coaSub, error: coaSubErr } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, parent_id, org_id')
    .like('code', '2-1-10%')

  console.log('\n========================================')
  console.log('COA CODES STARTING WITH 2-1-10')
  console.log('========================================')
  if (coaSubErr) {
    console.error('❌ Error:', coaSubErr)
  } else {
    console.log(`Found ${coaSub.length} matches:`)
    coaSub.forEach(c => {
      console.log(`- ID: ${c.id} | Code: ${c.code} | Name: ${c.name} | parent_id: ${c.parent_id} | org_id: ${c.org_id}`)
    })
  }

  // Search for any GL entries referencing 2-1-10-010 coa_id or code
  const { data: glEntries, error: glErr } = await supabase
    .from('gl_entries')
    .select('*, chart_of_accounts(code, name)')
    // Since we don't know the coa_id, let's fetch all and filter or join
  
  if (glErr) {
    console.error('❌ Error fetching GL entries:', glErr)
  } else {
    const targetEntries = glEntries.filter(e => e.chart_of_accounts?.code === '2-1-10-010')
    console.log('\n========================================')
    console.log(`GL ENTRIES FOR COA 2-1-10-010 (Count: ${targetEntries.length})`)
    console.log('========================================')
    targetEntries.forEach(e => {
      console.log(`- ID: ${e.id} | Date: ${e.entry_date} | Debit: ${e.debit} | Credit: ${e.credit} | Desc: ${e.description}`)
    })
  }

  await supabase.auth.signOut()
}

check()
