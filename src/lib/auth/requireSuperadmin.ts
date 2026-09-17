import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

interface SuperadminContext {
  userId: string
  /** Service-role client — bypasses RLS, only reachable after the superadmin check above passes. */
  adminClient: any
}

/**
 * Shared guard for every /api/admin/* route: confirms the caller is an
 * authenticated superadmin, then hands back a service-role client scoped to
 * that request. Each route previously copy-pasted this exact block, which
 * made it easy for a new admin route to forget a step; centralizing it means
 * there's only one place to get the check right.
 */
export async function requireSuperadmin(): Promise<
  { context: SuperadminContext; error?: undefined } | { context?: undefined; error: NextResponse }
> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    return { error: NextResponse.json({ error: 'Missing service role key' }, { status: 500 }) }
  }

  const authSupabase = await createServerClient()
  const { data: { user } } = await authSupabase.auth.getUser()

  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const { data: profile } = await authSupabase
    .from('user_profiles')
    .select('is_superadmin')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.is_superadmin) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  return { context: { userId: user.id, adminClient } }
}
