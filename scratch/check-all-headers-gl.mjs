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

  // Fetch all COAs
  const { data: coas, error: coaErr } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, is_header')

  if (coaErr) {
    console.error('❌ Error fetching COAs:', coaErr)
    return
  }

  const headerIds = new Set(coas.filter(c => c.is_header).map(c => c.id))
  const coaMap = {}
  coas.forEach(c => { coaMap[c.id] = c })

  // Fetch all gl_entries paginated
  let allEntries = []
  let from = 0
  let to = 999
  let done = false

  while (!done) {
    const { data: chunk, error: err } = await supabase
      .from('gl_entries')
      .select('id, coa_id, debit, credit, description, entry_date')
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

  console.log(`Loaded ${allEntries.length} GL entries. Checking if any target header accounts...`)

  const problemEntries = allEntries.filter(e => headerIds.has(e.coa_id))

  if (problemEntries.length === 0) {
    console.log('✅ Success: No GL entries target header accounts in the entire database!')
  } else {
    console.log(`❌ Mismatch: Found ${problemEntries.length} GL entries targeting header accounts!`)
    
    // Group problem entries by COA
    const problemGroups = {}
    problemEntries.forEach(e => {
      if (!problemGroups[e.coa_id]) {
        problemGroups[e.coa_id] = {
          coa: coaMap[e.coa_id],
          count: 0,
          debitSum: 0,
          creditSum: 0,
          examples: []
        }
      }
      const group = problemGroups[e.coa_id]
      group.count++
      group.debitSum += Number(e.debit || 0)
      group.creditSum += Number(e.credit || 0)
      if (group.examples.length < 5) {
        group.examples.push(e)
      }
    })

    Object.values(problemGroups).forEach(g => {
      console.log(`\nHeader Account: ${g.coa.code} (${g.coa.name}) | Postings: ${g.count}`)
      console.log(`  Total Debits: ${g.debitSum.toLocaleString('id-ID')} | Total Credits: ${g.creditSum.toLocaleString('id-ID')}`)
      console.log('  Sample postings:')
      g.examples.forEach(ex => {
        console.log(`    - ID: ${ex.id} | Date: ${ex.entry_date} | D=${ex.debit} / C=${ex.credit} | Desc: ${ex.description}`)
      })
    })
  }

  await supabase.auth.signOut()
}

check()
