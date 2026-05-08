import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function check() {
  const { data, error } = await supabase.rpc('post_invoice', {
    p_invoice_id: '00000000-0000-0000-0000-000000000000',
    p_outlet_id: '00000000-0000-0000-0000-000000000000',
    p_org_id: '00000000-0000-0000-0000-000000000000',
    p_lines: [{
      item_id: '00000000-0000-0000-0000-000000000000',
      qty: 1,
      unit_price: 1000,
      total_price: 1000
    }]
  })
  console.log('Error:', error)
}

check()
