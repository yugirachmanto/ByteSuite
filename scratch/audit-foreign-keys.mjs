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

async function audit() {
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

  console.log('🔍 Auditing GL Entries...')
  const { data: glEntries, error: glErr } = await supabase.from('gl_entries').select('id, coa_id, debit, credit, description, entry_date')
  const { data: coas, error: coaErr } = await supabase.from('chart_of_accounts').select('id, code, name')

  if (glErr || coaErr) {
    console.error('Error fetching data:', glErr || coaErr)
    return
  }

  const coaMap = {}
  coas.forEach(c => { coaMap[c.id] = c })

  let glOrphans = 0
  glEntries.forEach(g => {
    if (!coaMap[g.coa_id]) {
      glOrphans++
      console.log(`❌ GL Entry Orphan: ID ${g.id} references coa_id ${g.coa_id} which does not exist in chart_of_accounts! (Date: ${g.entry_date} | Debit: ${g.debit} | Credit: ${g.credit} | Desc: ${g.description})`)
    }
  })
  console.log(`Total GL Orphans: ${glOrphans}`)

  console.log('\n🔍 Auditing Invoice Lines...')
  const { data: invoiceLines, error: lineErr } = await supabase.from('invoice_lines').select('id, coa_id, total, description, invoice_id')
  let lineOrphans = 0
  invoiceLines.forEach(l => {
    if (l.coa_id && !coaMap[l.coa_id]) {
      lineOrphans++
      console.log(`❌ Invoice Line Orphan: ID ${l.id} references coa_id ${l.coa_id} which does not exist! (Desc: ${l.description} | Total: ${l.total})`)
    }
  })
  console.log(`Total Invoice Line Orphans: ${lineOrphans}`)

  await supabase.auth.signOut()
}

audit()
