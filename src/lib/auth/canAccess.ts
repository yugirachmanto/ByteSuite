import type { SupabaseClient } from '@supabase/supabase-js'

/** Fetches the current authenticated user's role, or null if unauthenticated/no profile. */
export async function getCurrentUserRole(supabase: SupabaseClient): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single()
  return profile?.role ?? null
}

/** Pure role check — does `role` appear in `allowedRoles`? */
export function canAccess(role: string | null, allowedRoles: string[]): boolean {
  return role !== null && allowedRoles.includes(role)
}
