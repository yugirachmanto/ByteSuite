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

  let allEntries = []
  let from = 0
  let step = 1000
  while (true) {
    const { data, error } = await supabase
      .from('gl_entries')
      .select('id, entry_date, description, debit, credit, reference_id, reference_type, coa_id, created_at, chart_of_accounts(code, name)')
      .range(from, from + step - 1)
      
    if (error) {
      console.error(error)
      break
    }
    
    if (data.length === 0) break
    
    allEntries = allEntries.concat(data)
    from += step
  }

  const groups = {}
  allEntries.forEach(e => {
    // For manual journals or non-reference, try to group by reference_id or fallback
    const key = e.reference_id || `${e.entry_date}_${e.description}`
    if (!groups[key]) {
      groups[key] = {
        key,
        reference_id: e.reference_id,
        entry_date: e.entry_date,
        description: e.description,
        debit: 0,
        credit: 0,
        entries: []
      }
    }
    groups[key].debit += Number(e.debit || 0)
    groups[key].credit += Number(e.credit || 0)
    groups[key].entries.push(e)
  })

  let unbalancedCount = 0
  Object.values(groups).forEach(g => {
    const diff = Math.round((g.debit - g.credit) * 100) / 100
    if (Math.abs(diff) >= 0.01) {
      unbalancedCount++
      console.log(`\nTransaction Key: ${g.key}`)
      console.log(`Date: ${g.entry_date} | Desc: ${g.description}`)
      console.log(`Total Debit: ${g.debit} | Total Credit: ${g.credit} | Diff: ${diff}`)
      console.log('Entries in this transaction:')
      g.entries.forEach(e => {
        console.log(`  - COA: ${e.chart_of_accounts?.code} (${e.chart_of_accounts?.name}) | Debit: ${e.debit} | Credit: ${e.credit} | Desc: ${e.description}`)
      })
    }
  })

  console.log(`\nTotal unbalanced transactions: ${unbalancedCount}`)
  await supabase.auth.signOut()
}

check()
