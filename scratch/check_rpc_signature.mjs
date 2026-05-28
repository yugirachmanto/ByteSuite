import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function testSignatures() {
  console.log('Testing preview_journal with new p_freight_distributed flag...')
  const { data, error } = await supabase.rpc('preview_journal', {
    p_invoice_id: '00000000-0000-0000-0000-000000000000',
    p_org_id: '00000000-0000-0000-0000-000000000000',
    p_lines: [],
    p_credit_coa_id: '00000000-0000-0000-0000-000000000000',
    p_tax_amount: 0,
    p_tax_coa_id: null,
    p_freight_amount: 0,
    p_freight_coa_id: null,
    p_freight_distributed: false
  })

  console.log('Error:', error)
  console.log('Result:', data)
}

testSignatures()
