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

  // Find all GL entries with debit or credit of 300,000
  const { data, error } = await supabase
    .from('gl_entries')
    .select('*, chart_of_accounts(code, name, type, parent_id, level, is_header)')
    .or('debit.eq.300000,credit.eq.300000')

  if (error) {
    console.error('❌ Error:', error)
    return
  }

  console.log(`\nFound ${data.length} entries with value 300.000:`)
  data.forEach(e => {
    console.log(`- Entry ID: ${e.id}`)
    console.log(`  Date: ${e.entry_date} | Desc: ${e.description}`)
    console.log(`  Debit: ${e.debit} | Credit: ${e.credit}`)
    console.log(`  COA ID: ${e.coa_id} | Code: ${e.chart_of_accounts?.code} (${e.chart_of_accounts?.name}) | is_header: ${e.chart_of_accounts?.is_header}`)
    console.log(`  Reference: Type=${e.reference_type}, ID=${e.reference_id}`)
  })

  // Also let's find ALL entries for the same reference_id to see the other leg(s) of the transaction!
  const refIds = [...new Set(data.map(e => e.reference_id).filter(Boolean))]
  if (refIds.length > 0) {
    console.log('\n========================================')
    console.log('ALL LEGS OF THE CORRESPONDING TRANSACTIONS')
    console.log('========================================')
    for (const refId of refIds) {
      const { data: legs, error: legErr } = await supabase
        .from('gl_entries')
        .select('*, chart_of_accounts(code, name, type)')
        .eq('reference_id', refId)

      if (legErr) {
        console.error('❌ Error fetching legs:', legErr)
        continue
      }

      console.log(`\nReference ID: ${refId}`)
      legs.forEach(leg => {
        console.log(`  * ${leg.chart_of_accounts?.code} (${leg.chart_of_accounts?.name}) | Debit: ${leg.debit} | Credit: ${leg.credit} | Desc: ${leg.description}`)
      })
    }
  }

  await supabase.auth.signOut()
}

check()
