import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Get all organizations (Service Role required)
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

    const { data: orgs, error } = await adminClient
      .from('organizations')
      .select(`
        *,
        outlets (count),
        user_profiles (id, full_name, role),
        tenant_invoices (*)
      `)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ organizations: orgs })

  } catch (error: any) {
    console.error('Fetch orgs error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// Update organization (suspend, billing, etc.)
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
    const { id, is_active, subscription_plan, subscription_status, next_billing_date } = body

    if (!id) return NextResponse.json({ error: 'Missing org id' }, { status: 400 })

    const updatePayload: any = {}
    if (is_active !== undefined) updatePayload.is_active = is_active
    if (subscription_plan !== undefined) updatePayload.subscription_plan = subscription_plan
    if (subscription_status !== undefined) updatePayload.subscription_status = subscription_status
    if (next_billing_date !== undefined) updatePayload.next_billing_date = next_billing_date

    const { data: updated, error } = await adminClient
      .from('organizations')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, organization: updated })

  } catch (error: any) {
    console.error('Update org error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
