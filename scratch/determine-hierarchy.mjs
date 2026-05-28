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

  const { data: coas, error } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, type, parent_id')
    .order('code')

  if (error) {
    console.error('❌ Error fetching COAs:', error)
    return
  }

  console.log(`Loaded ${coas.length} COAs. Analyzing prefixes...`)

  // Analyze prefixes
  const coaMap = {}
  coas.forEach(c => {
    coaMap[c.id] = { ...c, children: [] }
  })

  coas.forEach(c => {
    // Find parent based on prefix matching
    let bestParent = null
    coas.forEach(p => {
      if (p.id !== c.id && c.code.startsWith(p.code)) {
        if (!bestParent || p.code.length > bestParent.code.length) {
          bestParent = p
        }
      }
    })
    if (bestParent) {
      coaMap[c.id].derived_parent_id = bestParent.id
      coaMap[bestParent.id].children.push(coaMap[c.id])
    }
  })

  const headers = Object.values(coaMap).filter(c => c.children.length > 0)
  const leaves = Object.values(coaMap).filter(c => c.children.length === 0)

  console.log(`Derived Headers (Count: ${headers.length}):`)
  headers.forEach(h => {
    console.log(`- ${h.code} (${h.name}) has ${h.children.length} children. Children:`, h.children.map(ch => ch.code).join(', '))
  })

  console.log(`\nDerived Leaves (Count: ${leaves.length}):`)
  leaves.slice(0, 10).forEach(l => {
    console.log(`- ${l.code} (${l.name})`)
  })

  await supabase.auth.signOut()
}

check()
