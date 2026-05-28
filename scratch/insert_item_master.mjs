import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function testInsert() {
  const { data: profile } = await supabase.from('user_profiles').select('org_id').limit(1).single()
  console.log('Using Org ID:', profile?.org_id)
  
  if (!profile?.org_id) {
    console.log('No profiles found, trying insertion with null org_id or uuid.')
  }

  const { data, error } = await supabase.from('item_master').insert({
    org_id: profile?.org_id || '00000000-0000-0000-0000-000000000000',
    name: 'Test Temp Item ' + Date.now(),
    unit: 'PCS',
    category: 'raw',
    purchase_unit: 'PCS',
    conversion_factor: 1,
    is_inventory: true
  }).select()

  console.log('Error:', error)
  console.log('Inserted Data:', data)

  if (data && data.length > 0) {
    // clean up
    await supabase.from('item_master').delete().eq('id', data[0].id)
    console.log('Cleaned up successfully.')
  }
}

testInsert()
