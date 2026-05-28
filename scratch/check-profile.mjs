import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function checkProfile() {
  const { data: { user } } = await supabase.auth.getUser()
  console.log('Current User ID:', user?.id)
  
  if (user) {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    
    console.log('Profile:', profile)
    console.log('Profile Error:', error)
  }
}

checkProfile()
