import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'Server configuration error: missing service role key' },
        { status: 500 }
      )
    }

    // Authenticate the user making the request
    const authSupabase = await createServerClient()
    const { data: { user: currentUser }, error: authError } = await authSupabase.auth.getUser()
    
    if (authError || !currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the requester's profile to verify org_id and role
    const { data: profile } = await authSupabase
      .from('user_profiles')
      .select('org_id, role')
      .eq('id', currentUser.id)
      .single()

    if (!profile || profile.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden: Only owners can invite users' }, { status: 403 })
    }

    const body = await request.json()
    const { email, full_name, role, outlet_ids } = body

    if (!email || !role) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Initialize Supabase Admin client using the service role key to bypass RLS and create users
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Invite user via Supabase Auth Admin
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name,
        role
      }
    })

    if (inviteError) {
      return NextResponse.json({ error: inviteError.message }, { status: 400 })
    }

    const newUserId = inviteData.user.id

    // Insert or update the new user's profile in the user_profiles table.
    // We use the adminClient here to bypass RLS since the new user might not have set up their session yet,
    // and the inviter might not have policies that allow them to insert arbitrary users (although owner probably does).
    const { error: profileError } = await adminClient
      .from('user_profiles')
      .upsert({
        id: newUserId,
        org_id: profile.org_id,
        full_name: `[INVITED] ${full_name || 'Unnamed User'}`,
        role: role,
        outlet_ids: role === 'owner' ? [] : (outlet_ids || []),
        is_active: true
      })

    if (profileError) {
      return NextResponse.json({ error: 'Failed to create user profile: ' + profileError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, user: inviteData.user })

  } catch (error: any) {
    console.error('Invite error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
