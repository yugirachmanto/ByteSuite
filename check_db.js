const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkUserOrg() {
  const { data: users, error: usersError } = await supabase.auth.admin.listUsers()
  if (usersError) {
    console.error('Error fetching users:', usersError.message)
    return
  }

  const userIds = users.users.map(u => u.id)
  
  const { data: profiles, error: profilesError } = await supabase
    .from('user_profiles')
    .select('id, full_name, org_id, organizations(name, qris_image_url)')
    .in('id', userIds)
  
  console.log('Profiles:', JSON.stringify(profiles, null, 2))
}

checkUserOrg()
