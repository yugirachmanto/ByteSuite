-- =========================================================
-- FIX RLS + CLEAN ORPHAN DATA
-- Run this in Supabase SQL Editor → New Query
-- Safe to re-run multiple times.
-- =========================================================

-- ── 1. Enable RLS on every table ──────────────────────────
ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_master          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_batches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_balance    ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE opname_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_entries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integrations    ENABLE ROW LEVEL SECURITY;

-- Optional extra tables (created by migrations)
ALTER TABLE IF EXISTS default_coa_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS ap_payments          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS product_prices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS pph_rules            ENABLE ROW LEVEL SECURITY;


-- ── 2. user_profiles: each user sees only their own row ───
DROP POLICY IF EXISTS "Users can manage own profile" ON user_profiles;
CREATE POLICY "Users can manage own profile"
  ON user_profiles FOR ALL
  USING     (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- ── 3. organizations: scoped to own org ──────────────────
DROP POLICY IF EXISTS "Users can access their org data" ON organizations;
CREATE POLICY "Users can access their org data"
  ON organizations FOR ALL
  USING (id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));


-- ── 4. outlets: scoped to own org ────────────────────────
DROP POLICY IF EXISTS "Users can access their outlet data" ON outlets;
CREATE POLICY "Users can access their outlet data"
  ON outlets FOR ALL
  USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));


-- ── 5. item_master: scoped to own org ────────────────────
DROP POLICY IF EXISTS "Org access" ON item_master;
CREATE POLICY "Org access"
  ON item_master FOR ALL
  USING     (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));


-- ── 6. chart_of_accounts: scoped to own org ──────────────
DROP POLICY IF EXISTS "Org access" ON chart_of_accounts;
CREATE POLICY "Org access"
  ON chart_of_accounts FOR ALL
  USING     (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));


-- ── 7. bom: scoped to own org ────────────────────────────
DROP POLICY IF EXISTS "Org access"            ON bom;
DROP POLICY IF EXISTS "bom_management_policy" ON bom;
CREATE POLICY "bom_management_policy"
  ON bom FOR ALL TO authenticated
  USING     (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));


-- ── 8. invoices + invoice_lines: scoped via outlet → org ─
DROP POLICY IF EXISTS "Outlet access" ON invoices;
CREATE POLICY "Outlet access"
  ON invoices FOR ALL
  USING (outlet_id IN (
    SELECT id FROM outlets
    WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  ))
  WITH CHECK (outlet_id IN (
    SELECT id FROM outlets
    WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  ));

DROP POLICY IF EXISTS "Outlet access" ON invoice_lines;
CREATE POLICY "Outlet access"
  ON invoice_lines FOR ALL
  USING (invoice_id IN (
    SELECT id FROM invoices WHERE outlet_id IN (
      SELECT id FROM outlets
      WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    )
  ));


-- ── 9. inventory tables ───────────────────────────────────
DROP POLICY IF EXISTS "Outlet access" ON stock_ledger;
CREATE POLICY "Outlet access" ON stock_ledger FOR ALL
  USING     (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())))
  WITH CHECK (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Outlet access" ON stock_batches;
CREATE POLICY "Outlet access" ON stock_batches FOR ALL
  USING     (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())))
  WITH CHECK (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Outlet access" ON inventory_balance;
CREATE POLICY "Outlet access" ON inventory_balance FOR ALL
  USING     (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())))
  WITH CHECK (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Outlet access" ON production_log;
CREATE POLICY "Outlet access" ON production_log FOR ALL
  USING     (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())))
  WITH CHECK (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Outlet access" ON opname_log;
CREATE POLICY "Outlet access" ON opname_log FOR ALL
  USING     (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())))
  WITH CHECK (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())));


-- ── 10. GL entries ────────────────────────────────────────
DROP POLICY IF EXISTS "Outlet access"     ON gl_entries;
DROP POLICY IF EXISTS "Org access for GL" ON gl_entries;
CREATE POLICY "Org access for GL" ON gl_entries FOR ALL
  USING (outlet_id IN (
    SELECT o.id FROM outlets o
    JOIN user_profiles up ON up.org_id = o.org_id
    WHERE up.id = auth.uid()
  ));


-- ── 11. user_integrations ─────────────────────────────────
DROP POLICY IF EXISTS "Users can manage own integrations"       ON user_integrations;
DROP POLICY IF EXISTS "Users can manage their own integrations" ON user_integrations;
CREATE POLICY "Users can manage own integrations"
  ON user_integrations FOR ALL
  USING     (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ── 12. Optional extra tables ─────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'default_coa_mappings') THEN
    DROP POLICY IF EXISTS "Org access" ON default_coa_mappings;
    EXECUTE 'CREATE POLICY "Org access" ON default_coa_mappings FOR ALL
      USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()))';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ap_payments') THEN
    DROP POLICY IF EXISTS "Org access" ON ap_payments;
    EXECUTE 'CREATE POLICY "Org access" ON ap_payments FOR ALL
      USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()))';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_prices') THEN
    DROP POLICY IF EXISTS "Org access" ON product_prices;
    EXECUTE 'CREATE POLICY "Org access" ON product_prices FOR ALL
      USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()))';
  END IF;
END $$;


-- ── 13. Clean up orphan data ──────────────────────────────
-- Removes orgs/outlets/items that have no associated user profile.
-- This deletes test data from scratch scripts and old accounts.

-- Must delete in FK-dependency order
DELETE FROM item_master
WHERE org_id NOT IN (SELECT DISTINCT org_id FROM user_profiles WHERE org_id IS NOT NULL);

DELETE FROM chart_of_accounts
WHERE org_id NOT IN (SELECT DISTINCT org_id FROM user_profiles WHERE org_id IS NOT NULL);

DELETE FROM outlets
WHERE org_id NOT IN (SELECT DISTINCT org_id FROM user_profiles WHERE org_id IS NOT NULL);

DELETE FROM organizations
WHERE id NOT IN (SELECT DISTINCT org_id FROM user_profiles WHERE org_id IS NOT NULL);

-- =========================================================
-- Done. RLS is now active on all tables.
-- Every user can only see their own organization's data.
-- =========================================================
