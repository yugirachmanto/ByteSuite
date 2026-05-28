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

  const { data: invs } = await supabase.from('invoices').select('id, created_at').order('created_at', { ascending: false }).limit(1)
  if (invs && invs.length > 0) {
    const invId = invs[0].id
    const { data: gl } = await supabase.from('gl_entries').select('debit, credit, description').eq('reference_id', invId)
    console.log('Most recent invoice GL entries:', gl)
  }

  await supabase.auth.signOut()
}

check()
