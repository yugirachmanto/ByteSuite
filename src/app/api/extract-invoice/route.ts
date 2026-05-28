import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractInvoice } from '../../../lib/ai/invoice-parser'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify auth
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { invoice_id, image_url, outlet_name } = await request.json()

    if (!invoice_id || !image_url) {
      return NextResponse.json(
        { error: 'Missing invoice_id or image_url' },
        { status: 400 }
      )
    }

    const { data: invoiceRecord } = await supabase
      .from('invoices')
      .select('outlets(org_id)')
      .eq('id', invoice_id)
      .single()

    if (!invoiceRecord || !invoiceRecord.outlets) {
      return NextResponse.json({ error: 'Invoice or Organization not found' }, { status: 404 })
    }
    const org_id = (invoiceRecord.outlets as any).org_id

    // ── Resolve API key ────────────────────────────────────────────────────────
    // Priority 1: user's own key saved in Settings → Integrations
    // Priority 2: platform-level key from environment (only if set, e.g. self-hosted)
    // If neither is present → reject with a clear setup error.
    let apiKey: string | null = null

    try {
      const { data: integration } = await supabase
        .from('user_integrations')
        .select('credentials')
        .eq('user_id', user.id)
        .eq('provider', 'openai')
        .eq('is_active', true)
        .single()

      apiKey = (integration?.credentials as any)?.api_key ?? null
    } catch {
      // user_integrations row simply doesn't exist yet
    }

    // Fall back to platform key only if explicitly configured in the environment
    if (!apiKey && process.env.OPENAI_API_KEY) {
      apiKey = process.env.OPENAI_API_KEY
    }

    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'OpenAI API key not configured. Please add your API key in Settings → Integrations before using AI extraction.',
          setup_required: true,
          setup_url: '/integrations',
        },
        { status: 402 }
      )
    }
    // ──────────────────────────────────────────────────────────────────────────

    // Fetch image and convert to base64
    const imageResponse = await fetch(image_url)
    if (!imageResponse.ok) {
      throw new Error(`Failed to fetch invoice image: ${imageResponse.status}`)
    }

    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg'
    const arrayBuffer = await imageResponse.arrayBuffer()
    const base64 = Buffer.from(arrayBuffer).toString('base64')

    // Determine media type
    let mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf' = 'image/jpeg'
    if (contentType.includes('png'))  mediaType = 'image/png'
    else if (contentType.includes('webp')) mediaType = 'image/webp'
    else if (contentType.includes('pdf'))  mediaType = 'application/pdf'

    // Fetch context data for AI
    let coaAccounts: { id: string; code: string; name: string }[] = []
    let existingVendors: { id: string; name: string }[] = []
    let itemMasters: { id: string; name: string; unit: string; default_coa_id: string }[] = []

    try {
      const [coas, vends, items] = await Promise.all([
        supabase.from('chart_of_accounts').select('id, code, name').eq('org_id', org_id).eq('is_active', true),
        supabase.from('vendors').select('id, name').eq('org_id', org_id),
        supabase.from('item_master').select('id, name, unit, default_coa_id').eq('org_id', org_id)
      ])
      if (coas.data) coaAccounts = coas.data
      if (vends.data) existingVendors = vends.data
      if (items.data) itemMasters = items.data
    } catch (dbError) {
      console.error('Failed to load AI context data:', dbError)
    }

    // Call OpenAI
    const extracted = await extractInvoice(base64, mediaType, outlet_name || '', apiKey, coaAccounts, existingVendors, itemMasters)

    let vendor_id = extracted.vendor?.id || null

    if (!vendor_id && extracted.vendor?.name) {
      const { data: newVendor } = await supabase
        .from('vendors')
        .insert({
          org_id,
          name: extracted.vendor.name,
          email: extracted.vendor.email,
          phone: extracted.vendor.phone,
          bank_name: extracted.vendor.bank_name,
          bank_account_no: extracted.vendor.bank_account_no,
          bank_account_name: extracted.vendor.bank_account_name,
          address: extracted.vendor.address
        })
        .select('id')
        .single()
      
      if (newVendor) {
        vendor_id = newVendor.id
        extracted.vendor.id = newVendor.id
      }
    }

    // Update invoice with extracted data
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        extracted_data: extracted,
        vendor: extracted.vendor?.name || 'Unknown',
        vendor_id: vendor_id,
        invoice_no: extracted.invoice_no,
        invoice_date: extracted.invoice_date,
        subtotal: extracted.subtotal,
        tax_total: extracted.tax_total,
        grand_total: extracted.grand_total,
        status: 'extracted',
      })
      .eq('id', invoice_id)

    if (updateError) {
      throw new Error(`Failed to update invoice: ${updateError.message}`)
    }

    return NextResponse.json({ success: true, invoice_id, extracted_data: extracted })

  } catch (error: any) {
    console.error('=== Extract invoice error ===')
    console.error('Message:', error.message)
    console.error('Stack:', error.stack)
    console.error('============================')

    // Reset invoice status to pending so user can retry
    try {
      const body = await request.clone().json()
      if (body.invoice_id) {
        const supabase = await createClient()
        await supabase.from('invoices').update({ status: 'pending' }).eq('id', body.invoice_id)
      }
    } catch { /* ignore cleanup errors */ }

    return NextResponse.json(
      { error: error.message || 'Failed to extract invoice' },
      { status: 500 }
    )
  }
}
