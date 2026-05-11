import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractInvoice } from '../../../lib/ai/invoice-parser'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Verify auth
    const {
      data: { user },
    } = await supabase.auth.getUser()
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
    if (contentType.includes('png')) mediaType = 'image/png'
    else if (contentType.includes('webp')) mediaType = 'image/webp'
    else if (contentType.includes('pdf')) mediaType = 'application/pdf'

    // Fetch OpenAI API key if available with graceful fallback
    let userApiKey = null
    try {
      const { data: integration } = await supabase
        .from('user_integrations')
        .select('credentials')
        .eq('user_id', user.id)
        .eq('provider', 'openai')
        .eq('is_active', true)
        .single()

      userApiKey = (integration?.credentials as any)?.api_key
    } catch (dbError) {
      // Silently fallback to env key if integration table is not ready
      console.log('Using environment API key (integration table fallback)')
    }

    // Call OpenAI API
    const extracted = await extractInvoice(base64, mediaType, outlet_name || '', userApiKey)

    // Update invoice with extracted data
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        extracted_data: extracted,
        vendor: extracted.vendor,
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

    return NextResponse.json({
      success: true,
      invoice_id,
      extracted_data: extracted,
    })
  } catch (error: any) {
    console.error('=== Extract invoice error ===')
    console.error('Message:', error.message)
    console.error('Stack:', error.stack)
    console.error('============================')

    // Try to reset status to pending so user can retry
    try {
      const body = await request.clone().json()
      if (body.invoice_id) {
        const supabase = await createClient()
        await supabase
          .from('invoices')
          .update({ status: 'pending' })
          .eq('id', body.invoice_id)
      }
    } catch {
      // Ignore cleanup errors
    }

    return NextResponse.json(
      { error: error.message || 'Failed to extract invoice' },
      { status: 500 }
    )
  }
}
