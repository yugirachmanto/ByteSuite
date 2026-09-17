import { NextResponse } from 'next/server'
import { requireSuperadmin } from '@/lib/auth/requireSuperadmin'

// List every plan (including inactive — admin needs to see and reactivate them)
export async function GET() {
  try {
    const { context, error } = await requireSuperadmin()
    if (error) return error
    const { adminClient } = context

    const { data: plans, error: fetchError } = await adminClient
      .from('subscription_plans')
      .select('*')
      .order('sort_order', { ascending: true })

    if (fetchError) throw fetchError

    return NextResponse.json({ plans })

  } catch (error: any) {
    console.error('Fetch plans error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { context, error } = await requireSuperadmin()
    if (error) return error
    const { adminClient } = context

    const body = await request.json()
    const { name, price, max_outlets, max_users, features, description, sort_order } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Plan name is required' }, { status: 400 })
    }

    const { data: plan, error: insertError } = await adminClient
      .from('subscription_plans')
      .insert({
        name: name.trim(),
        price: price === '' || price === undefined ? null : price,
        max_outlets: max_outlets === '' || max_outlets === undefined ? null : max_outlets,
        max_users: max_users === '' || max_users === undefined ? null : max_users,
        features: Array.isArray(features) ? features : [],
        description: description || null,
        sort_order: sort_order ?? 0,
      })
      .select()
      .single()

    if (insertError) throw insertError

    return NextResponse.json({ success: true, plan })

  } catch (error: any) {
    console.error('Create plan error:', error)
    return NextResponse.json({ error: error.message?.includes('duplicate') ? 'A plan with this name already exists' : 'Internal Server Error' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const { context, error } = await requireSuperadmin()
    if (error) return error
    const { adminClient } = context

    const body = await request.json()
    const { id, name, price, max_outlets, max_users, features, description, sort_order, is_active } = body

    if (!id) return NextResponse.json({ error: 'Missing plan id' }, { status: 400 })

    const updatePayload: any = { updated_at: new Date().toISOString() }
    if (name !== undefined) updatePayload.name = name
    if (price !== undefined) updatePayload.price = price === '' ? null : price
    if (max_outlets !== undefined) updatePayload.max_outlets = max_outlets === '' ? null : max_outlets
    if (max_users !== undefined) updatePayload.max_users = max_users === '' ? null : max_users
    if (features !== undefined) updatePayload.features = features
    if (description !== undefined) updatePayload.description = description
    if (sort_order !== undefined) updatePayload.sort_order = sort_order
    if (is_active !== undefined) updatePayload.is_active = is_active

    const { data: updated, error: updateError } = await adminClient
      .from('subscription_plans')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    return NextResponse.json({ success: true, plan: updated })

  } catch (error: any) {
    console.error('Update plan error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
