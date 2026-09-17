import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requireSuperadmin } from './requireSuperadmin'

interface CronContext {
  adminClient: any
  /** true when authenticated via CRON_SECRET (no logged-in user behind the call) */
  isCron: boolean
}

/**
 * Same guarantee as requireSuperadmin() (only a superadmin or a genuine
 * server-to-server cron call reaches the service-role client), but also
 * accepts Vercel Cron's request: Vercel automatically sends
 * `Authorization: Bearer $CRON_SECRET` on every cron invocation when a
 * `CRON_SECRET` env var is configured on the project, so checking that
 * header is sufficient to distinguish "Vercel's scheduler" from anyone else
 * hitting this URL blind. Falls back to the normal logged-in-superadmin
 * check for the "Generate Now" button in the admin UI.
 */
export async function requireSuperadminOrCron(
  request: Request
): Promise<{ context: CronContext; error?: undefined } | { context?: undefined; error: NextResponse }> {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return { error: NextResponse.json({ error: 'Missing service role key' }, { status: 500 }) }
    }
    const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
    return { context: { adminClient, isCron: true } }
  }

  const result = await requireSuperadmin()
  if (result.error) return { error: result.error }
  return { context: { adminClient: result.context.adminClient, isCron: false } }
}
