-- Fase 2 of the admin/client-oversight roadmap: replaces organizations.
-- subscription_plan (a freeform string an admin could set to literally
-- anything via the PATCH endpoint, with zero connection to the plan
-- definitions shown on the tenant billing page) with a real catalog table.
--
-- organizations.subscription_plan (text) is kept, not dropped — plenty of
-- existing UI reads it directly for display/search/filter. Going forward the
-- admin UI writes both subscription_plan_id and a matching subscription_plan
-- string together, so every existing read site keeps working unchanged while
-- the new FK becomes the source of truth for anything that needs real plan
-- data (price, limits, features).

CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  -- NULL = "Custom" / contact-us pricing (matches the old Enterprise tier),
  -- not a real zero price.
  price NUMERIC,
  -- NULL = unlimited, matching how the old hardcoded "Enterprise" tier had
  -- no cap; enforcing these limits is a later phase, this just gives the
  -- catalog somewhere to record them.
  max_outlets INTEGER,
  max_users INTEGER,
  features TEXT[] NOT NULL DEFAULT '{}',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

-- Global catalog, not org-scoped — any authenticated user can read active
-- plans (needed so the tenant billing page can show real plan details).
-- Writes only ever happen through /api/admin/plans (service-role, guarded
-- by requireSuperadmin()), so no INSERT/UPDATE policy is needed here.
CREATE POLICY "Authenticated users can view active plans"
  ON subscription_plans FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Seed the 3 tiers that already existed as a hardcoded array in
-- (dashboard)/billing/page.tsx, so the catalog starts in sync with what
-- tenants have been shown all along.
INSERT INTO subscription_plans (name, price, max_outlets, max_users, features, description, sort_order) VALUES
  ('Free', 0, 1, 3, ARRAY['1 Outlet', 'Up to 3 Users', 'Basic Reporting', 'Community Support'], 'Perfect for small operations getting started.', 0),
  ('Pro', 750000, 5, NULL, ARRAY['Up to 5 Outlets', 'Unlimited Users', 'Advanced Accounting', 'Priority Support'], 'Everything you need for a growing business.', 1),
  ('Enterprise', NULL, NULL, NULL, ARRAY['Unlimited Outlets', 'Custom Integrations', 'Dedicated Account Manager', '24/7 Phone Support'], 'For large scale operations and custom needs.', 2);

ALTER TABLE organizations ADD COLUMN subscription_plan_id UUID REFERENCES subscription_plans(id);

-- Backfill: match each org's existing freeform subscription_plan text to a
-- seeded plan by name (case-insensitive); anything unmatched or null
-- defaults to Free rather than being left dangling.
UPDATE organizations o
SET subscription_plan_id = sp.id
FROM subscription_plans sp
WHERE lower(trim(o.subscription_plan)) = lower(sp.name);

UPDATE organizations o
SET subscription_plan_id = (SELECT id FROM subscription_plans WHERE name = 'Free'),
    subscription_plan = 'Free'
WHERE o.subscription_plan_id IS NULL;
