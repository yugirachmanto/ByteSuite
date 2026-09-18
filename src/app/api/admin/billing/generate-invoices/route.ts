import { NextResponse } from 'next/server'
import { requireSuperadminOrCron } from '@/lib/auth/requireSuperadminOrCron'
import { createTenantInvoice } from '@/lib/admin/billing'

// Called two ways: Vercel Cron daily via GET (Vercel always issues GET for
// scheduled invocations — see vercel.json, authenticated via CRON_SECRET)
// and the "Generate Now" button in /admin/billing via POST (authenticated as
// a logged-in superadmin) — both funnel through requireSuperadminOrCron and
// run the identical job.
//
// Does two independent jobs in one pass:
//  1. Bill every active org whose next_billing_date has arrived, once per
//     billing_period (the partial unique index on tenant_invoices makes this
//     safe to call repeatedly — a period that's already billed is silently
//     skipped, not duplicated).
//  2. Flag any 'pending' invoice whose due_date has passed as 'overdue' —
//     the in-app signal (no email exists to send a reminder with yet).
async function generateInvoices(request: Request) {
  try {
    const { context, error } = await requireSuperadminOrCron(request)
    if (error) return error
    const { adminClient } = context

    const todayIso = new Date().toISOString().split('T')[0]

    // ── Job 1: generate due invoices ──────────────────────────────────────
    const { data: dueOrgs, error: orgsError } = await adminClient
      .from('organizations')
      .select('id, name, subscription_plan_id, next_billing_date, subscription_plans(name, price)')
      .eq('is_active', true)
      .not('subscription_plan_id', 'is', null)
      .lte('next_billing_date', todayIso)

    if (orgsError) throw orgsError

    const created: { org: string; invoice_id: string }[] = []
    const skipped: { org: string; reason: string }[] = []

    for (const org of dueOrgs || []) {
      const plan = org.subscription_plans as any
      if (!plan || plan.price === null || Number(plan.price) <= 0) {
        skipped.push({ org: org.name, reason: 'Plan has no billable price (Free or Custom)' })
        continue
      }

      const { data: outlet } = await adminClient
        .from('outlets')
        .select('id')
        .eq('org_id', org.id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()

      if (!outlet) {
        skipped.push({ org: org.name, reason: 'No outlet to bill against' })
        continue
      }

      const billingPeriod = `${org.next_billing_date.slice(0, 7)}-01`
      const periodLabel = new Date(org.next_billing_date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      const dueDate = new Date(org.next_billing_date)
      dueDate.setDate(dueDate.getDate() + 7) // one week grace period before it's flagged overdue

      try {
        const invoice = await createTenantInvoice(adminClient, {
          org_id: org.id,
          payment_outlet_id: outlet.id,
          description: `${plan.name} Plan - ${periodLabel} Subscription`,
          amount: Number(plan.price),
          due_date: dueDate.toISOString().split('T')[0],
          billing_period: billingPeriod,
        })

        // Advance from the org's own prior next_billing_date (not "today"),
        // so a job that runs late doesn't skip a period or drift the cycle.
        const nextDate = new Date(org.next_billing_date)
        nextDate.setMonth(nextDate.getMonth() + 1)
        await adminClient
          .from('organizations')
          .update({ next_billing_date: nextDate.toISOString().split('T')[0] })
          .eq('id', org.id)

        created.push({ org: org.name, invoice_id: invoice.id })
      } catch (err: any) {
        // Unique violation on (org_id, billing_period) means this period was
        // already billed (e.g. the cron already ran today) — not an error,
        // just move on. Any other error is worth surfacing in the summary.
        if (err.code === '23505') {
          skipped.push({ org: org.name, reason: 'Already billed for this period' })
        } else {
          skipped.push({ org: org.name, reason: err.message || 'Unknown error' })
        }
      }
    }

    // ── Job 2: flag overdue invoices ──────────────────────────────────────
    const { data: overdueInvoices, error: overdueError } = await adminClient
      .from('tenant_invoices')
      .update({ status: 'overdue' })
      .eq('status', 'pending')
      .lt('due_date', todayIso)
      .select('id')

    if (overdueError) throw overdueError

    return NextResponse.json({
      success: true,
      invoices_created: created.length,
      created,
      skipped,
      flagged_overdue: (overdueInvoices || []).length,
    })

  } catch (error: any) {
    console.error('Generate invoices error:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return generateInvoices(request)
}

export async function POST(request: Request) {
  return generateInvoices(request)
}
