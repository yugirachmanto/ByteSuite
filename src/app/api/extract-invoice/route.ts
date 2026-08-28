import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractInvoice } from '../../../lib/ai/invoice-parser'
import { getSignedFileUrl } from '@/lib/storage'

export const dynamic = 'force-dynamic'

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

    // Verify the caller actually belongs to the org that owns this invoice —
    // without this, any authenticated user could extract/overwrite another org's invoice.
    const { data: callerProfile } = await supabase
      .from('user_profiles')
      .select('org_id')
      .eq('id', user.id)
      .single()

    if (!callerProfile || callerProfile.org_id !== org_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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

    if (!apiKey) {
      return NextResponse.json(
        {
          error: 'OpenAI API key not configured. Please add your API key in Integrations before using AI extraction.',
          setup_required: true,
          setup_url: '/integrations',
        },
        { status: 402 }
      )
    }
    // ──────────────────────────────────────────────────────────────────────────

    // Fetch image and convert to base64. The invoices bucket is private, so a
    // stored public-style URL 403s — resolve a short-lived signed URL first
    // (skipped for external references like a pasted Google Drive link, which
    // aren't a Supabase storage object at all).
    const fetchUrl = image_url.includes('drive.google.com')
      ? image_url
      : (await getSignedFileUrl(supabase, 'invoices', image_url)) || image_url

    const imageResponse = await fetch(fetchUrl)
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
    let historicalPatterns: { description: string; coa_id: string; is_inventory: boolean; item_master_id: string | null; count: number }[] = []

    try {
      const [coas, vends, items, outletsRes] = await Promise.all([
        // is_header accounts can't receive postings — excluding them here means
        // the AI physically cannot be offered one as a choice, instead of relying
        // on prompt text ("only select leaf accounts") to stop it after the fact.
        supabase.from('chart_of_accounts').select('id, code, name').eq('org_id', org_id).eq('is_active', true).eq('is_header', false),
        supabase.from('vendors').select('id, name').eq('org_id', org_id),
        supabase.from('item_master').select('id, name, unit, default_coa_id').eq('org_id', org_id),
        supabase.from('outlets').select('id').eq('org_id', org_id)
      ])
      if (coas.data) coaAccounts = coas.data
      if (vends.data) existingVendors = vends.data
      if (items.data) itemMasters = items.data

      // Build historical line-item patterns from previously POSTED invoices —
      // those are the ones a human actually reviewed and confirmed, i.e.
      // verified ground truth the AI can learn from instead of guessing fresh
      // every time. Unposted/draft invoices are excluded since their coa_id/
      // is_inventory may just be an earlier (possibly wrong) AI guess.
      const outletIds = (outletsRes.data || []).map(o => o.id)
      if (outletIds.length > 0) {
        const { data: postedInvoiceIds } = await supabase
          .from('invoices')
          .select('id')
          .in('outlet_id', outletIds)
          .eq('status', 'posted')
          .order('created_at', { ascending: false })
          .limit(150)

        const invoiceIds = (postedInvoiceIds || []).map(i => i.id)
        if (invoiceIds.length > 0) {
          const { data: pastLines } = await supabase
            .from('invoice_lines')
            .select('description, coa_id, is_inventory, item_master_id')
            .in('invoice_id', invoiceIds)
            .not('coa_id', 'is', null)
            .not('description', 'is', null)

          // Aggregate by normalized description -> mode coa_id / is_inventory + count
          const groups = new Map<string, { coa_id: string; is_inventory: boolean; item_master_id: string | null; count: number; coaCounts: Map<string, number>; invCounts: Map<string, number> }>()
          for (const line of pastLines || []) {
            const key = (line.description || '').trim().toLowerCase()
            if (!key || !line.coa_id) continue
            let g = groups.get(key)
            if (!g) {
              g = { coa_id: line.coa_id, is_inventory: !!line.is_inventory, item_master_id: line.item_master_id, count: 0, coaCounts: new Map(), invCounts: new Map() }
              groups.set(key, g)
            }
            g.count++
            g.coaCounts.set(line.coa_id, (g.coaCounts.get(line.coa_id) || 0) + 1)
            const invKey = String(!!line.is_inventory)
            g.invCounts.set(invKey, (g.invCounts.get(invKey) || 0) + 1)
            if (!g.item_master_id && line.item_master_id) g.item_master_id = line.item_master_id
          }

          // Cap the payload sent to the AI — orgs with a lot of history could
          // otherwise bloat prompt size/cost. Keep the most-frequently-confirmed
          // patterns first, since those are the strongest signal anyway.
          historicalPatterns = Array.from(groups.entries())
            .map(([description, g]) => {
              const modeCoaId = Array.from(g.coaCounts.entries()).sort((a, b) => b[1] - a[1])[0][0]
              const modeIsInventory = Array.from(g.invCounts.entries()).sort((a, b) => b[1] - a[1])[0][0] === 'true'
              return { description, coa_id: modeCoaId, is_inventory: modeIsInventory, item_master_id: g.item_master_id, count: g.count }
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 200)
        }
      }
    } catch (dbError) {
      console.error('Failed to load AI context data:', dbError)
    }

    // Call OpenAI
    const extracted = await extractInvoice(base64, mediaType, outlet_name || '', apiKey, coaAccounts, existingVendors, itemMasters, historicalPatterns)

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

    // Sanitize extracted COA IDs: if the AI accidentally returned the COA code or name instead of the UUID, map it back.
    if (extracted.line_items && Array.isArray(extracted.line_items)) {
      extracted.line_items = extracted.line_items.map(item => {
        if (item.coa_id) {
          const matchedByCode = coaAccounts.find(c => c.code === item.coa_id)
          if (matchedByCode) {
            item.coa_id = matchedByCode.id
          } else {
            const matchedByName = coaAccounts.find(c => c.name.toLowerCase() === item.coa_id?.toLowerCase())
            if (matchedByName) item.coa_id = matchedByName.id
          }
        }
        return item
      })
    }

    // Only persist money fields the AI returned as real finite numbers —
    // a NaN/non-numeric extraction must not silently land in the DB.
    const toFiniteOrNull = (v: unknown): number | null =>
      typeof v === 'number' && Number.isFinite(v) ? v : null

    // Update invoice with extracted data
    const { error: updateError } = await supabase
      .from('invoices')
      .update({
        extracted_data: extracted,
        vendor: extracted.vendor?.name || 'Unknown',
        vendor_id: vendor_id,
        invoice_no: extracted.invoice_no,
        invoice_date: extracted.invoice_date,
        subtotal: toFiniteOrNull(extracted.subtotal),
        tax_total: toFiniteOrNull(extracted.tax_total),
        grand_total: toFiniteOrNull(extracted.grand_total),
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
