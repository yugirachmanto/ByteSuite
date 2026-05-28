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

  const { data: coa } = await supabase.from('chart_of_accounts').select('*').ilike('code', '%2-1-10-010%')
  console.log('COA Found:', JSON.stringify(coa, null, 2))

  const { data: coaByName } = await supabase.from('chart_of_accounts').select('*').ilike('name', '%AP - Raw%')
  console.log('COA By Name Found:', JSON.stringify(coaByName, null, 2))

  await supabase.auth.signOut()
}

check()
