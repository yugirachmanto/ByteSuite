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

async function run() {
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

  const defaultOutletId = '36a91bca-6867-4e4c-bd10-9ed84de5f07a'
  const realOutletId = 'd5d032d8-14ce-45cb-9045-ad870bc3bc57'

  console.log(`\nChecking if Default Outlet (${defaultOutletId}) has any references...`)

  // Check references in invoices
  const { count: invCount } = await supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('outlet_id', defaultOutletId)
  // Check references in gl_entries
  const { count: glCount } = await supabase.from('gl_entries').select('id', { count: 'exact', head: true }).eq('outlet_id', defaultOutletId)
  // Check references in stock_ledger
  const { count: slCount } = await supabase.from('stock_ledger').select('id', { count: 'exact', head: true }).eq('outlet_id', defaultOutletId)

  console.log(`Invoices: ${invCount}, GL Entries: ${glCount}, Stock Ledger: ${slCount}`)

  if ((invCount || 0) === 0 && (glCount || 0) === 0 && (slCount || 0) === 0) {
    console.log('🧹 Safely removing empty Default Outlet to make Lengkong the immediate default!')

    // 1. Update user profile outlet_ids array to only contain the real outlet
    const { error: profileErr } = await supabase
      .from('user_profiles')
      .update({ outlet_ids: [realOutletId] })
      .eq('id', authData.session.user.id)

    if (profileErr) {
      console.error('❌ Failed to update user profile outlet_ids:', profileErr.message)
    } else {
      console.log('✅ Updated user profile outlet_ids to [realOutletId] only.')
    }

    // 2. Delete Default Outlet
    const { error: delErr } = await supabase
      .from('outlets')
      .delete()
      .eq('id', defaultOutletId)

    if (delErr) {
      console.error('❌ Failed to delete Default Outlet:', delErr.message)
    } else {
      console.log('✅ Successfully deleted empty Default Outlet.')
    }
  } else {
    console.log('⚠️ Cannot delete Default Outlet: It has reference records.')
  }

  await supabase.auth.signOut()
}

run()
