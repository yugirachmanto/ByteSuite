import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const org_id = searchParams.get('org_id')

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

    let query = adminClient.from('tenant_invoices').select('*').order('created_at', { ascending: false })
    if (org_id) {
      query = query.eq('org_id', org_id)
    }

    const { data: invoices, error } = await query

    if (error) throw error

    return NextResponse.json({ invoices })

  } catch (error: any) {
    console.error('Fetch invoices error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
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
    const { org_id, description, amount, due_date } = body

    if (!org_id || !description || amount === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: invoice, error } = await adminClient
      .from('tenant_invoices')
      .insert({
        org_id,
        description,
        amount,
        due_date: due_date || null,
        status: 'pending'
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, invoice })

  } catch (error: any) {
    console.error('Create invoice error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

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
    const { id, status } = body

    if (!id || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

    // If we are marking as paid, perform auto-journaling
    if (status === 'paid') {
      const { data: invoice } = await adminClient.from('tenant_invoices').select('*').eq('id', id).single()
      
      if (invoice && invoice.status !== 'paid' && invoice.payment_outlet_id && invoice.payment_asset_coa_id && invoice.payment_expense_coa_id) {
        // Create 2 GL entries: Debit Expense, Credit Asset
        const today = new Date().toISOString().split('T')[0]
        const description = `Payment for Invoice #${invoice.id.split('-')[0].toUpperCase()}`

        await adminClient.from('gl_entries').insert([
          {
            outlet_id: invoice.payment_outlet_id,
            entry_date: today,
            coa_id: invoice.payment_expense_coa_id,
            debit: invoice.amount,
            credit: 0,
            reference_id: invoice.id,
            reference_type: 'invoice_payment',
            description: description
          },
          {
            outlet_id: invoice.payment_outlet_id,
            entry_date: today,
            coa_id: invoice.payment_asset_coa_id,
            debit: 0,
            credit: invoice.amount,
            reference_id: invoice.id,
            reference_type: 'invoice_payment',
            description: description
          }
        ])
      }
    }

    const { data: updated, error } = await adminClient
      .from('tenant_invoices')
      .update({ status })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, invoice: updated })

  } catch (error: any) {
    console.error('Update invoice error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
