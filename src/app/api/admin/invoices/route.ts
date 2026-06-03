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

    let query = adminClient.from('tenant_invoices').select('*, organizations(name)').order('created_at', { ascending: false })
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
    const { org_id, payment_outlet_id, description, amount, due_date } = body

    if (!org_id || !payment_outlet_id || !description || amount === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: invoice, error } = await adminClient
      .from('tenant_invoices')
      .insert({
        org_id,
        payment_outlet_id,
        description,
        amount,
        due_date: due_date || null,
        status: 'pending'
      })
      .select()
      .single()

    if (error) throw error

    // Also immediately insert a pending AP invoice for the tenant's outlet
    const today = new Date().toISOString().split('T')[0]
    await adminClient.from('invoices').insert({
      outlet_id: payment_outlet_id,
      vendor: 'ByteSuite',
      invoice_no: `SUB-${invoice.id.split('-')[0].toUpperCase()}`,
      invoice_date: today,
      grand_total: amount,
      paid_amount: 0,
      status: 'pending',
      payment_status: 'unpaid',
    })

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

        // Update the existing AP Invoice (or create if it somehow doesn't exist for older billings)
        const invoiceNo = `SUB-${invoice.id.split('-')[0].toUpperCase()}`
        const { data: existingAP } = await adminClient
          .from('invoices')
          .select('id')
          .eq('invoice_no', invoiceNo)
          .eq('vendor', 'ByteSuite')
          .maybeSingle()

        if (existingAP) {
          await adminClient.from('invoices').update({
            status: 'posted',
            payment_status: 'paid',
            paid_amount: invoice.amount
          }).eq('id', existingAP.id)
        } else {
          await adminClient.from('invoices').insert({
            outlet_id: invoice.payment_outlet_id,
            vendor: 'ByteSuite',
            invoice_no: invoiceNo,
            invoice_date: today,
            grand_total: invoice.amount,
            paid_amount: invoice.amount,
            status: 'posted',
            payment_status: 'paid',
          })
        }
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

export async function DELETE(request: Request) {
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

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) return NextResponse.json({ error: 'Missing invoice id' }, { status: 400 })

    const { data: invoice } = await adminClient.from('tenant_invoices').select('status').eq('id', id).single()
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    // Only allow deletion of pending or under_review
    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Cannot delete a paid invoice' }, { status: 400 })
    }

    // Delete corresponding AP invoice
    const invoiceNo = `SUB-${id.split('-')[0].toUpperCase()}`
    await adminClient.from('invoices').delete().eq('invoice_no', invoiceNo).eq('vendor', 'ByteSuite')

    // Delete tenant invoice
    const { error } = await adminClient.from('tenant_invoices').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete invoice error:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
