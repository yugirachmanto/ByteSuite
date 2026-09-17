-- Fase 3 of the admin/client-oversight roadmap: recurring invoice
-- generation, overdue flagging, and a real plan-upgrade request flow.

-- 1. billing_period identifies which billing cycle an auto-generated
--    invoice covers (first day of the billed month) so the generator can
--    never double-bill the same org for the same period, even if the cron
--    fires twice or someone clicks "Generate Now" right after a cron run.
--    NULL for the existing manually-created ad-hoc invoices — the partial
--    unique index below only constrains rows that actually set it.
ALTER TABLE tenant_invoices ADD COLUMN billing_period DATE;

CREATE UNIQUE INDEX tenant_invoices_org_billing_period_key
  ON tenant_invoices (org_id, billing_period)
  WHERE billing_period IS NOT NULL;

-- 2. Plan upgrade requests — previously the tenant billing page's
-- "Upgrade" button was fully fake (a timeout + toast, reaching nothing
-- durable). This table is the real destination: a tenant requests a plan,
-- an admin sees it in /admin/billing and acts on it.
CREATE TABLE plan_upgrade_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  requested_plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  -- References user_profiles (not auth.users directly) so PostgREST can
  -- embed the requester's name for the admin UI without touching the auth
  -- schema.
  requested_by UUID REFERENCES user_profiles(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending, contacted, completed, dismissed
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE plan_upgrade_requests ENABLE ROW LEVEL SECURITY;

-- Org members can see and create their own org's requests (mirrors the
-- existing tenant_invoices policy shape) — but never update/delete one,
-- since only an admin resolving the request should change its status.
CREATE POLICY "Users can view their org's upgrade requests"
  ON plan_upgrade_requests FOR SELECT
  USING (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY "Users can request an upgrade for their own org"
  ON plan_upgrade_requests FOR INSERT
  WITH CHECK (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()));

-- Admin resolution (PATCH from /api/admin/upgrade-requests) always goes
-- through the service-role client, which bypasses RLS entirely — no
-- UPDATE policy needed here, matching subscription_plans' own convention.
