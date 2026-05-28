import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Manually parse .env.local
const envPath = path.resolve('.env.local')
const envContent = fs.readFileSync(envPath, 'utf8')
const envVars = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
  if (match) {
    const key = match[1]
    let value = match[2] || ''
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.substring(1, value.length - 1)
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.substring(1, value.length - 1)
    }
    envVars[key] = value.trim()
  }
})

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY

console.log('Using URL:', supabaseUrl)
const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  console.log('Querying invoices...')
  const { data: inv, error: invError } = await supabase.from('invoices').select('id').limit(1)
  console.log('Invoices error:', invError)
  console.log('Invoices data:', inv)

  console.log('Querying vendors...')
  const { data: vend, error: vendError } = await supabase.from('vendors').select('id').limit(1)
  console.log('Vendors error:', vendError)
  console.log('Vendors data:', vend)
}

check()
