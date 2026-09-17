import { NextResponse } from 'next/server'
import { requireSuperadmin } from '@/lib/auth/requireSuperadmin'

// Get all users (Service Role required)
export async function GET() {
  try {
    const { context, error } = await requireSuperadmin()
    if (error) return error
    const { adminClient } = context

    const { data: users, error: fetchError } = await adminClient
      .from('user_profiles')
      .select(`
        *,
        organizations(name)
      `)
      .order('full_name', { ascending: true })

    if (fetchError) throw fetchError

    return NextResponse.json({ users })

  } catch (error: any) {
    console.error('Fetch users error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// Update user (suspend, etc.)
export async function PATCH(request: Request) {
  try {
    const { context, error } = await requireSuperadmin()
    if (error) return error
    const { adminClient } = context

    const body = await request.json()
    const { id, is_active } = body

    if (!id) return NextResponse.json({ error: 'Missing user id' }, { status: 400 })

    const updatePayload: any = {}
    if (is_active !== undefined) updatePayload.is_active = is_active

    const { data: updated, error: updateError } = await adminClient
      .from('user_profiles')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single()

    if (updateError) throw updateError

    return NextResponse.json({ success: true, user: updated })

  } catch (error: any) {
    console.error('Update user error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
