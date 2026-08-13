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

    if (!profile || (profile.role !== 'owner' && profile.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden: Only owners and admins can invite users' }, { status: 403 })
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

    const origin = request.headers.get('origin')
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host')
    const proto = request.headers.get('x-forwarded-proto') || 'https'
    const reqUrl = origin || (host ? `${proto}://${host}` : null)
    const rawSiteUrl = reqUrl || process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')
    const siteUrl = rawSiteUrl.replace(/\/$/, '')
    const redirectTo = `${siteUrl}/setup-account`

    let newUserId: string | null = null
    let actionLink: string | null = null

    // 1. Try standard inviteUserByEmail
    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name,
        role
      },
      redirectTo
    })

    if (!inviteError && inviteData?.user) {
      newUserId = inviteData.user.id
    } else {
      // If user already exists or invite email fails, try generateLink (type: 'invite' or 'magiclink')
      let linkRes = await adminClient.auth.admin.generateLink({
        type: 'invite',
        email,
        options: { redirectTo }
      })

      if (linkRes.error) {
        linkRes = await adminClient.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: { redirectTo }
        })
      }

      if (linkRes.error || !linkRes.data?.user) {
        return NextResponse.json(
          { error: inviteError?.message || linkRes.error?.message || 'Failed to send user invitation' },
          { status: 400 }
        )
      }

      newUserId = linkRes.data.user.id
      actionLink = linkRes.data.properties?.action_link || null
    }

    // 2. Insert or update the user's profile in user_profiles
    const { error: profileError } = await adminClient
      .from('user_profiles')
      .upsert({
        id: newUserId,
        org_id: profile.org_id,
        full_name: `[INVITED] ${full_name || 'Unnamed User'}`,
        role: role,
        outlet_ids: (role === 'owner' || role === 'admin') ? [] : (outlet_ids || []),
        is_active: true
      })

    if (profileError) {
      return NextResponse.json({ error: 'Failed to create user profile: ' + profileError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, user_id: newUserId, link: actionLink })

  } catch (error: any) {
    console.error('Invite error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
