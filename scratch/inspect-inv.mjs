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

  const { data: inv } = await supabase.from('invoices').select('*').eq('id', 'b5da62f9-d901-4ce2-838f-743d25799616')
  const { data: lines } = await supabase.from('invoice_lines').select('*').eq('invoice_id', 'b5da62f9-d901-4ce2-838f-743d25799616')
  const { data: gl } = await supabase.from('gl_entries').select('*').eq('reference_id', 'b5da62f9-d901-4ce2-838f-743d25799616')
  
  console.log('Invoice:', JSON.stringify(inv, null, 2))
  console.log('Lines:', JSON.stringify(lines, null, 2))
  console.log('GL Entries:', JSON.stringify(gl, null, 2))

  await supabase.auth.signOut()
}

check()
