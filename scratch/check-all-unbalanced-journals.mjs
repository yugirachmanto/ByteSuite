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

  // Fetch all gl_entries by paging
  let allEntries = []
  let from = 0
  let to = 999
  let done = false

  while (!done) {
    const { data: chunk, error: err } = await supabase
      .from('gl_entries')
      .select('id, entry_date, description, debit, credit, reference_id, coa_id, chart_of_accounts(code, name)')
      .range(from, to)

    if (err) {
      console.error('❌ Error fetching chunk:', err)
      break
    }

    allEntries = allEntries.concat(chunk)
    if (chunk.length < 1000) {
      done = true
    } else {
      from += 1000
      to += 1000
    }
  }

  const groups = {}
  allEntries.forEach(e => {
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

  console.log('========================================')
  console.log('UNBALANCED TRANSACTIONS (PAGINATED)')
  console.log('========================================')
  
  let unbalancedCount = 0
  let totalDiff = 0
  
  Object.values(groups).forEach(g => {
    const diff = g.debit - g.credit
    if (Math.abs(diff) >= 0.01) {
      unbalancedCount++
      totalDiff += diff
      console.log(`\n- Trans: ${g.description} | Date: ${g.entry_date} | Key: ${g.key}`)
      console.log(`  Debits: ${g.debit.toLocaleString('id-ID')} | Credits: ${g.credit.toLocaleString('id-ID')} | Diff: ${diff.toLocaleString('id-ID')}`)
      
      if (g.entries.length <= 15) {
        g.entries.forEach(e => {
          console.log(`    * ${e.chart_of_accounts?.code} (${e.chart_of_accounts?.name}): D=${e.debit.toLocaleString('id-ID')} / C=${e.credit.toLocaleString('id-ID')}`)
        })
      } else {
        console.log(`    * (${g.entries.length} entries, showing first 5)`)
        g.entries.slice(0, 5).forEach(e => {
          console.log(`    * ${e.chart_of_accounts?.code} (${e.chart_of_accounts?.name}): D=${e.debit.toLocaleString('id-ID')} / C=${e.credit.toLocaleString('id-ID')}`)
        })
      }
    }
  })

  console.log('\n========================================')
  console.log(`Total unbalanced transactions: ${unbalancedCount}`)
  console.log(`Net Difference of all unbalanced: ${totalDiff.toLocaleString('id-ID')}`)
  console.log('========================================')

  await supabase.auth.signOut()
}

check()
