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
  const { data: authData } = await supabase.auth.signInWithPassword({
    email: 'admin@bytesuite.erp',
    password: 'password123'
  })

  await supabase.auth.setSession({
    access_token: authData.session.access_token,
    refresh_token: authData.session.refresh_token
  })

  // get all invoices from yesterday and today
  const { data: invs } = await supabase.from('invoices').select('id, invoice_no, created_at, status').order('created_at', { ascending: false }).limit(10)
  
  if (invs) {
    for (const inv of invs) {
      const { data: gl } = await supabase.from('gl_entries').select('*, coa:coa_id(code, name)').eq('reference_id', inv.id)
      const hasUnmapped = gl?.some(g => g.coa === null)
      if (hasUnmapped) {
        console.log('Invoice', inv.invoice_no, 'has unmapped COA entries (from Org B/Suspense Account).')
      } else {
        const codes = gl?.map(g => g.coa?.code).join(', ')
        console.log('Invoice', inv.invoice_no, 'codes:', codes)
      }
    }
  }

  await supabase.auth.signOut()
}

check()
