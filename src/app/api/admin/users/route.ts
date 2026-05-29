import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Get all users (Service Role required)
export async function GET() {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const authSupabase = await createServerClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await authSupabase
      .from('user_profiles')
      .select('is_superadmin')
      .eq('id', user.id)
      .single()

    if (!profile || !profile.is_superadmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: users, error } = await adminClient
      .from('user_profiles')
      .select(`
        *,
        organizations(name)
      `)
      .order('full_name', { ascending: true })

    if (error) throw error

    return NextResponse.json({ users })

  } catch (error: any) {
    console.error('Fetch users error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// Update user (suspend, etc.)
export async function PATCH(request: Request) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) return NextResponse.json({ error: 'Missing service role key' }, { status: 500 })

    const authSupabase = await createServerClient()
    const { data: { user } } = await authSupabase.auth.getUser()
    
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await authSupabase
      .from('user_profiles')
      .select('is_superadmin')
      .eq('id', user.id)
      .single()

    if (!profile || !profile.is_superadmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const body = await request.json()
    const { id, is_active } = body

    if (!id) return NextResponse.json({ error: 'Missing user id' }, { status: 400 })

    const updatePayload: any = {}
    if (is_active !== undefined) updatePayload.is_active = is_active

    const { data: updated, error } = await adminClient
      .from('user_profiles')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, user: updated })

  } catch (error: any) {
    console.error('Update user error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
