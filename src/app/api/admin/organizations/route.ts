import { NextResponse } from 'next/server'
import { requireSuperadmin } from '@/lib/auth/requireSuperadmin'

// Get all organizations (Service Role required)
export async function GET() {
  try {
    const { context, error } = await requireSuperadmin()
    if (error) return error
    const { adminClient } = context

    const { data: orgs, error: fetchError } = await adminClient
      .from('organizations')
      .select(`
        *,
        outlets (id, name),
        user_profiles (id, full_name, role, is_active, is_superadmin),
        tenant_invoices (*),
        subscription_plans (id, name, price, max_outlets, max_users, features)
      `)
      .order('created_at', { ascending: false })

    if (fetchError) throw fetchError

    return NextResponse.json({ organizations: orgs })

  } catch (error: any) {
    console.error('Fetch orgs error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// Update organization (suspend, billing, etc.)
export async function PATCH(request: Request) {
  try {
    const { context, error } = await requireSuperadmin()
    if (error) return error
    const { adminClient } = context

    const body = await request.json()
    const { id, is_active, subscription_plan, subscription_plan_id, subscription_status, next_billing_date } = body

    if (!id) return NextResponse.json({ error: 'Missing org id' }, { status: 400 })

    const updatePayload: any = {}
    if (is_active !== undefined) updatePayload.is_active = is_active
    if (subscription_plan !== undefined) updatePayload.subscription_plan = subscription_plan
    if (subscription_status !== undefined) updatePayload.subscription_status = subscription_status
    if (next_billing_date !== undefined) updatePayload.next_billing_date = next_billing_date

    // subscription_plan_id is the source of truth going forward — resolve its
    // name server-side (never trust a client-supplied subscription_plan
    // string alongside it) so the two stay in sync for the many existing UI
    // spots that still just read the plain-text column.
    if (subscription_plan_id !== undefined) {
      updatePayload.subscription_plan_id = subscription_plan_id || null
      if (subscription_plan_id) {
        const { data: plan } = await adminClient
          .from('subscription_plans')
          .select('name')
          .eq('id', subscription_plan_id)
          .single()
        if (plan) updatePayload.subscription_plan = plan.name
      }
    }

    const { data: updated, error: updateError } = await adminClient
      .from('organizations')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    return NextResponse.json({ success: true, organization: updated })

  } catch (error: any) {
    console.error('Update org error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
