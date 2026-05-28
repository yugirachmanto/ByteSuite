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

  const { data: invs, error } = await supabase.from('invoices').select('id, invoice_no, grand_total, status').order('created_at', { ascending: false }).limit(3)
  if (error) console.error(error)
  console.log('Recent invoices:', invs)

  if (invs && invs.length > 0) {
    for (const inv of invs) {
      const { data: gl } = await supabase.from('gl_entries').select('*, coa:coa_id(code, name, type)').eq('reference_id', inv.id)
      console.log('Invoice GL entries:', JSON.stringify(gl, null, 2))
    }
  }

  await supabase.auth.signOut()
}

check()
