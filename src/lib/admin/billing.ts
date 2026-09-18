/**
 * Shared invoice-creation logic for the platform-billing side (tenant_invoices +
 * its paired AP `invoices` row so the subscription bill shows as a payable in
 * the tenant's own books). Used by both the admin "New Bill" API route and the
 * recurring invoice generator — previously only the former existed, and this
 * is that same insert pair extracted so a second caller doesn't duplicate the
 * SUB-<id> naming convention and risk drifting from it.
 */
export async function createTenantInvoice(
  adminClient: any,
  params: {
    org_id: string
    payment_outlet_id: string
    description: string
    amount: number
    due_date?: string | null
    billing_period?: string | null
  }
) {
  const { org_id, payment_outlet_id, description, amount, due_date, billing_period } = params

  const { data: invoice, error: insertError } = await adminClient
    .from('tenant_invoices')
    .insert({
      org_id,
      payment_outlet_id,
      description,
      amount,
      due_date: due_date || null,
      billing_period: billing_period || null,
      status: 'pending',
    })
    .select()
    .single()

  if (insertError) throw insertError

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

  return invoice
}
