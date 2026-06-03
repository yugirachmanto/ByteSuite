import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
    }

    const authSupabase = await createServerClient()
    const { data: { user: currentUser }, error: authError } = await authSupabase.auth.getUser()
    
    if (authError || !currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await authSupabase
      .from('user_profiles')
      .select('role')
      .eq('id', currentUser.id)
      .single()

    if (!profile || (profile.role !== 'owner' && profile.role !== 'admin')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { user_id } = await request.json()
    if (!user_id) {
      return NextResponse.json({ error: 'Missing user_id' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: { user: targetUser }, error: getUserError } = await adminClient.auth.admin.getUserById(user_id)
    if (getUserError || !targetUser || !targetUser.email) {
      return NextResponse.json({ error: 'User not found or has no email' }, { status: 404 })
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
    
    // Generate an invite link. Supabase will send the email automatically if email confirmations are enabled, 
    // but this also allows us to return the link so the owner can copy it manually if needed.
    let { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'invite',
      email: targetUser.email,
      options: {
        redirectTo: `${siteUrl}/setup-account`
      }
    })

    if (linkError) {
      const msg = linkError.message.toLowerCase()
      if (msg.includes('already') || msg.includes('taken') || msg.includes('exists')) {
        // Fallback: If they are already registered, generate a password recovery link
        // which acts effectively the same as a setup account link.
        const fallback = await adminClient.auth.admin.generateLink({
          type: 'recovery',
          email: targetUser.email,
          options: {
            redirectTo: `${siteUrl}/setup-account`
          }
        })
        linkData = fallback.data
        linkError = fallback.error
      }

      if (linkError) {
        return NextResponse.json({ error: linkError.message }, { status: 400 })
      }
    }

    return NextResponse.json({ success: true, link: linkData.properties?.action_link })
  } catch (error: any) {
    console.error('Resend invite error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
