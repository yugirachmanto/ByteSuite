/**
 * verify-coa-hierarchy.mjs
 * Runs 5 structural integrity checks on the COA hierarchy after migration.
 * Run AFTER applying supabase/migrations/20240528000000_coa_hierarchy.sql
 * 
 * Usage: node scratch/verify-coa-hierarchy.mjs
 */
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
const ORG_ID = 'f8dccba6-501b-4fdb-9131-fc411a62b95a'

function pass(msg) { console.log(`  ✅ PASS: ${msg}`) }
function fail(msg, rows) {
  console.error(`  ❌ FAIL: ${msg}`)
  if (rows?.length > 0) {
    console.error('     Problem rows:')
    rows.slice(0, 10).forEach(r => console.error('     ', JSON.stringify(r)))
    if (rows.length > 10) console.error(`     ... and ${rows.length - 10} more`)
  }
}

async function runChecks() {
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'admin@bytesuite.erp',
    password: 'password123'
  })
  if (authErr) { console.error('❌ Auth failed:', authErr.message); return }

  await supabase.auth.setSession({
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token
  })

  console.log('\n========================================')
  console.log('COA Hierarchy Verification Checks')
  console.log('========================================\n')

  // Fetch all COAs with their hierarchy fields
  const { data: coas, error: coaErr } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, type, level, is_header, parent_id, org_id')
    .eq('org_id', ORG_ID)
    .order('code')

  if (coaErr) { console.error('Cannot fetch COAs:', coaErr.message); return }
  console.log(`Total COAs (including new headers): ${coas.length}\n`)

  const { data: glEntries, error: glErr } = await supabase
    .from('gl_entries')
    .select('id, coa_id')

  if (glErr) { console.error('Cannot fetch GL Entries:', glErr.message); return }

  // ── Check 1: Every leaf must have a parent_id ─────────────────────────────
  console.log('Check 1: Every leaf account has a parent_id...')
  const orphanLeaves = coas.filter(c => !c.is_header && !c.parent_id)
  if (orphanLeaves.length === 0) {
    pass(`All ${coas.filter(c => !c.is_header).length} leaf accounts have a parent_id`)
  } else {
    fail(`${orphanLeaves.length} leaf accounts are missing parent_id`, orphanLeaves.map(c => ({ code: c.code, name: c.name })))
  }

  // ── Check 2: Every header must have at least one child ────────────────────
  console.log('\nCheck 2: Every header account has at least one child...')
  const headers = coas.filter(c => c.is_header)
  const childMap = {}
  coas.forEach(c => {
    if (c.parent_id) {
      childMap[c.parent_id] = (childMap[c.parent_id] || 0) + 1
    }
  })
  const childlessHeaders = headers.filter(h => !childMap[h.id])
  if (childlessHeaders.length === 0) {
    pass(`All ${headers.length} header accounts have at least one child`)
  } else {
    fail(`${childlessHeaders.length} headers have no children`, childlessHeaders.map(c => ({ code: c.code, name: c.name })))
  }

  // ── Check 3: No header account has a GL entry ─────────────────────────────
  console.log('\nCheck 3: No header account has a direct GL entry...')
  const headerIds = new Set(headers.map(h => h.id))
  const entriesOnHeaders = glEntries.filter(e => headerIds.has(e.coa_id))
  if (entriesOnHeaders.length === 0) {
    pass(`All ${glEntries.length} GL entries target leaf accounts only`)
  } else {
    const problemCoas = [...new Set(entriesOnHeaders.map(e => e.coa_id))].map(id => {
      const c = coas.find(c => c.id === id)
      return { code: c?.code, name: c?.name, entries: entriesOnHeaders.filter(e => e.coa_id === id).length }
    })
    fail(`${entriesOnHeaders.length} GL entries target header accounts`, problemCoas)
  }

  // ── Check 4: Level consistency (child.level = parent.level + 1) ──────────
  console.log('\nCheck 4: Level consistency (child.level = parent.level + 1)...')
  const coaById = {}
  coas.forEach(c => { coaById[c.id] = c })
  const levelMismatches = coas.filter(c => {
    if (!c.parent_id) return false
    const parent = coaById[c.parent_id]
    if (!parent) return false
    return c.level !== parent.level + 1
  }).map(c => ({
    code: c.code,
    level: c.level,
    parent_code: coaById[c.parent_id]?.code,
    parent_level: coaById[c.parent_id]?.level
  }))
  if (levelMismatches.length === 0) {
    pass('All account levels are consistent with their parent levels')
  } else {
    fail(`${levelMismatches.length} accounts have inconsistent levels`, levelMismatches)
  }

  // ── Check 5: Rollup sanity (header asset totals = leaf asset totals) ───────
  console.log('\nCheck 5: Rollup sanity — header total should equal leaf total for assets...')
  const { data: treeAll, error: treeErr } = await supabase
    .rpc('get_coa_balance_tree', {
      p_org_id: ORG_ID,
      p_date_from: '2000-01-01',
      p_date_to: new Date().toISOString().split('T')[0]
    })

  if (treeErr) {
    console.log('  ⚠️  SKIP: get_coa_balance_tree RPC not yet applied. Run migration first.')
    console.log('     Error:', treeErr.message)
  } else {
    const headerAssets = treeAll.filter(r => r.coa_level === 1 && r.coa_code.startsWith('1'))
    const leafAssets   = treeAll.filter(r => !r.is_header && r.coa_code.startsWith('1'))
    const headerTotal  = headerAssets.reduce((s, r) => s + (r.balance || 0), 0)
    const leafTotal    = leafAssets.reduce((s, r) => s + (r.balance || 0), 0)

    // Allow floating-point epsilon
    if (Math.abs(headerTotal - leafTotal) < 0.01) {
      pass(`Rollup matches: header_total = leaf_total = ${leafTotal.toLocaleString('id-ID')}`)
    } else {
      fail(`Rollup mismatch: header_total = ${headerTotal.toLocaleString('id-ID')} vs leaf_total = ${leafTotal.toLocaleString('id-ID')}`, [])
    }
  }

  console.log('\n========================================')
  console.log('Verification complete.')
  console.log('If all 5 checks pass, migration is good to go!')
  console.log('========================================\n')

  await supabase.auth.signOut()
}

runChecks().catch(e => {
  console.error('Unexpected error:', e)
  process.exit(1)
})
