'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export async function updateUserProfile(
  userId: string, 
  data: {
    full_name?: string
    role?: string
    outlet_ids?: string[]
    is_active?: boolean
  }
) {
  try {
    const authSupabase = await createServerClient()
    const { data: { user: currentUser }, error: authError } = await authSupabase.auth.getUser()
    
    if (authError || !currentUser) {
      throw new Error('Unauthorized')
    }

    // Get the requester's profile to verify org_id and role
    const { data: profile } = await authSupabase
      .from('user_profiles')
      .select('org_id, role')
      .eq('id', currentUser.id)
      .single()

    if (!profile || profile.role !== 'owner') {
      throw new Error('Forbidden: Only owners can manage users')
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      throw new Error('Server configuration error: missing service role key')
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    if (data.role === 'owner') {
      data.outlet_ids = []
    }

    // Update the profile
    const { error: updateError } = await adminClient
      .from('user_profiles')
      .update(data)
      .eq('id', userId)
      .eq('org_id', profile.org_id) // ensure they are in the same org

    if (updateError) {
      throw updateError
    }

    return { success: true }
  } catch (error: any) {
    console.error('Update user error:', error)
    return { success: false, error: error.message }
  }
}

export async function deleteUser(userId: string) {
  try {
    const authSupabase = await createServerClient()
    const { data: { user: currentUser }, error: authError } = await authSupabase.auth.getUser()
    
    if (authError || !currentUser) {
      throw new Error('Unauthorized')
    }

    // Get the requester's profile to verify org_id and role
    const { data: profile } = await authSupabase
      .from('user_profiles')
      .select('org_id, role')
      .eq('id', currentUser.id)
      .single()

    if (!profile || profile.role !== 'owner') {
      throw new Error('Forbidden: Only owners can manage users')
    }

    if (currentUser.id === userId) {
      throw new Error('You cannot delete your own account')
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      throw new Error('Server configuration error: missing service role key')
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Verify user belongs to same org
    const { data: targetUser } = await adminClient
      .from('user_profiles')
      .select('org_id')
      .eq('id', userId)
      .single()

    if (!targetUser || targetUser.org_id !== profile.org_id) {
      throw new Error('User not found in your organization')
    }

    // Delete from auth.users (this should cascade delete user_profiles if foreign key is set up, but we will also delete user_profile just in case)
    const { error: deleteAuthError } = await adminClient.auth.admin.deleteUser(userId)
    
    if (deleteAuthError) {
      console.warn("Failed to delete auth user, attempting profile deletion anyway:", deleteAuthError.message)
    }

    const { error: deleteProfileError } = await adminClient
      .from('user_profiles')
      .delete()
      .eq('id', userId)
      .eq('org_id', profile.org_id)

    if (deleteProfileError && !deleteAuthError) { // if auth deletion worked, profile might have cascaded, so error is fine
      throw deleteProfileError
    }

    return { success: true }
  } catch (error: any) {
    console.error('Delete user error:', error)
    return { success: false, error: error.message }
  }
}
