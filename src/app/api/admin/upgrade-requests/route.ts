import { NextResponse } from 'next/server'
import { requireSuperadmin } from '@/lib/auth/requireSuperadmin'

export async function GET() {
  try {
    const { context, error } = await requireSuperadmin()
    if (error) return error
    const { adminClient } = context

    const { data: requests, error: fetchError } = await adminClient
      .from('plan_upgrade_requests')
      .select('*, organizations(name, subscription_plan), subscription_plans(name, price), requested_by:user_profiles!plan_upgrade_requests_requested_by_fkey(full_name)')
      .order('created_at', { ascending: false })

    if (fetchError) throw fetchError

    return NextResponse.json({ requests })

  } catch (error: any) {
    console.error('Fetch upgrade requests error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const { context, error } = await requireSuperadmin()
    if (error) return error
    const { adminClient } = context

    const body = await request.json()
    const { id, status, notes, apply_plan } = body

    if (!id || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    const updatePayload: any = { status, updated_at: new Date().toISOString() }
    if (notes !== undefined) updatePayload.notes = notes

    const { data: updated, error: updateError } = await adminClient
      .from('plan_upgrade_requests')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    // Convenience: "Mark Completed" can also apply the requested plan to the
    // org directly, since that's the near-universal next step — resolve the
    // plan name server-side same as the org PATCH route does, never trusting
    // a client-supplied name alongside the id.
    if (status === 'completed' && apply_plan) {
      const { data: plan } = await adminClient
        .from('subscription_plans')
        .select('name')
        .eq('id', updated.requested_plan_id)
        .single()

      if (plan) {
        await adminClient
          .from('organizations')
          .update({ subscription_plan_id: updated.requested_plan_id, subscription_plan: plan.name })
          .eq('id', updated.org_id)
      }
    }

    return NextResponse.json({ success: true, request: updated })

  } catch (error: any) {
    console.error('Update upgrade request error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
