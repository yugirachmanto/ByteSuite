import type { SupabaseClient } from '@supabase/supabase-js'

export interface OrgProfile {
  id: string
  name: string
  address: string | null
  phone: string | null
  npwp: string | null
  logo_url: string | null
}

/** Fetches the letterhead-relevant fields for a printed document's org header. */
export async function getOrgProfile(supabase: SupabaseClient, orgId: string): Promise<OrgProfile | null> {
  const { data } = await supabase
    .from('organizations')
    .select('id, name, address, phone, npwp, logo_url')
    .eq('id', orgId)
    .single()
  return data
}

/** Resolves the current authenticated user's org_id, for pages that need it before any other fetch. */
export async function getCurrentOrgId(supabase: SupabaseClient): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user.id).single()
  return profile?.org_id || null
}
