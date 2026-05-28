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

async function test() {
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

  const { data: coas } = await supabase
    .from('chart_of_accounts')
    .select('id, code, name, type')
    .order('code')

  console.log('Generating virtual headers for the 47 COAs...')

  const allAccounts = []
  const accountMap = {}

  // Add the 47 leaf accounts
  coas.forEach(c => {
    const acc = { id: c.id, code: c.code, name: c.name, type: c.type, is_header: false, level: 3 }
    allAccounts.push(acc)
    accountMap[c.code] = acc
  })

  // Names dictionary for virtual headers
  const headerNames = {
    // Level 1 (Class)
    '1-0-000': 'Aset',
    '2-0-000': 'Kewajiban',
    '3-0-000': 'Ekuitas',
    '4-0-000': 'Pendapatan',
    '5-0-000': 'Harga Pokok Penjualan',
    '6-0-000': 'Beban',
    // Level 2 (Group)
    '1-1-000': 'Aset Lancar',
    '1-2-000': 'Aset Tetap',
    '1-4-000': 'Beban Dibayar Dimuka',
    '1-6-000': 'Aset Tetap Lainnya',
    '2-1-000': 'Kewajiban Lancar',
    '3-1-000': 'Modal Saham & Saldo Laba',
    '4-1-000': 'Pendapatan Usaha',
    '5-1-000': 'HPP Makanan & Minuman',
    '6-1-000': 'Beban Gaji & Utilitas',
    '6-2-000': 'Beban Perlengkapan',
    '6-4-000': 'Beban Premis',
    '6-5-000': 'Beban Umum & Administrasi',
    // Level 3 (Sub-Group)
    '1-1-20-000': 'Kas di Bank',
    '1-4-10-000': 'Akumulasi Beban Dibayar Dimuka',
    '1-6-20-000': 'Gedung & Bangunan',
    '1-6-30-000': 'Peralatan & Perlengkapan (FFE)',
    '1-6-60-000': 'Peralatan Operasional',
    '6-2-00-000': 'Rincian Perlengkapan',
    '6-4-00-000': 'Rincian Premis',
    '6-5-00-000': 'Rincian Umum & Administrasi',
  }

  function getParentCode(code) {
    const parts = code.split('-')
    if (parts.length === 3) {
      // e.g. 1-1-001 -> parent 1-1-000, grandparent 1-0-000
      const classCode = `${parts[0]}-0-000`
      const groupCode = `${parts[0]}-${parts[1]}-000`
      return { parentCode: groupCode, grandparentCode: classCode, level: 3 }
    } else if (parts.length === 4) {
      // e.g. 1-1-20-010 -> parent 1-1-20-000, grandparent 1-1-000, great-grandparent 1-0-000
      const classCode = `${parts[0]}-0-000`
      const groupCode = `${parts[0]}-${parts[1]}-000`
      const subgroupCode = `${parts[0]}-${parts[1]}-${parts[2]}-000`
      return { parentCode: subgroupCode, grandparentCode: groupCode, greatGrandparentCode: classCode, level: 4 }
    }
    return null
  }

  // Create virtual headers
  allAccounts.forEach(acc => {
    const res = getParentCode(acc.code)
    if (res) {
      acc.level = res.level
      // Level 1
      const l1Code = res.greatGrandparentCode || res.grandparentCode
      if (!accountMap[l1Code]) {
        accountMap[l1Code] = { id: 'l1-' + l1Code, code: l1Code, name: headerNames[l1Code] || `Group ${l1Code}`, type: acc.type, is_header: true, level: 1 }
      }
      // Level 2
      const l2Code = res.grandparentCode || res.parentCode
      if (res.greatGrandparentCode && !accountMap[l2Code]) {
        accountMap[l2Code] = { id: 'l2-' + l2Code, code: l2Code, name: headerNames[l2Code] || `Group ${l2Code}`, type: acc.type, is_header: true, level: 2 }
      }
      // Level 3 (if subgroup exists)
      const l3Code = res.parentCode
      if (res.greatGrandparentCode && !accountMap[l3Code]) {
        accountMap[l3Code] = { id: 'l3-' + l3Code, code: l3Code, name: headerNames[l3Code] || `Group ${l3Code}`, type: acc.type, is_header: true, level: 3 }
      }
      
      // Link parent_id
      acc.derived_parent_code = res.parentCode
    }
  })

  // Link parents of headers
  Object.values(accountMap).forEach(acc => {
    if (acc.is_header) {
      const parts = acc.code.split('-')
      if (acc.level === 2) {
        acc.derived_parent_code = `${parts[0]}-0-000`
      } else if (acc.level === 3) {
        acc.derived_parent_code = `${parts[0]}-${parts[1]}-000`
      }
    }
  })

  console.log(`\nDerived Total Accounts (Headers + Leaves): ${Object.keys(accountMap).length}`)
  const sorted = Object.values(accountMap).sort((a, b) => a.code.localeCompare(b.code))

  console.log('\nSample Tree Visual:')
  sorted.slice(0, 20).forEach(acc => {
    const indent = '  '.repeat(acc.level - 1)
    console.log(`${indent}${acc.code} - ${acc.name} [Header: ${acc.is_header}, Level: ${acc.level}] -> Parent: ${acc.derived_parent_code || 'None'}`)
  })

  await supabase.auth.signOut()
}

test()
