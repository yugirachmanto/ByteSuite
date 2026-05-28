-- ============================================================
-- MIGRATION: 20240504000002_onboarding_rls_fix.sql
-- Fixes:
--   1. Missing RLS policy on user_profiles (outlets stay blank after login)
--   2. Missing RLS policies for chart_of_accounts, item_master, bom, user_integrations
--   3. Missing updated_at column on invoices (post_invoice RPC crashes)
--   4. Atomic register_new_org RPC (replaces fragile 4-step client inserts)
-- ============================================================


-- ── STORAGE: Create invoices bucket ─────────────────────────────────────────
-- Files are stored at: {org_id}/{outlet_id}/{invoice_id}.{ext}
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoices',
  'invoices',
  true,                                           -- public so image_url works without signed URLs
  10485760,                                       -- 10 MB per file
  ARRAY['image/jpeg','image/png','image/webp','image/jpg']
)
ON CONFLICT (id) DO NOTHING;                      -- safe to re-run

-- Storage RLS: let authenticated users upload / read / delete invoice images
DROP POLICY IF EXISTS "Authenticated users can upload invoices" ON storage.objects;
CREATE POLICY "Authenticated users can upload invoices"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoices');

DROP POLICY IF EXISTS "Authenticated users can read invoices" ON storage.objects;
CREATE POLICY "Authenticated users can read invoices"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'invoices');

DROP POLICY IF EXISTS "Authenticated users can delete invoices" ON storage.objects;
CREATE POLICY "Authenticated users can delete invoices"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'invoices');


-- ── 0. Fix init-migration policies that used auth.uid_org_id() ───────────────
--    The init migration created these with auth.uid_org_id() which doesn't
--    exist on hosted Supabase. Drop and recreate with inline subqueries.

DROP POLICY IF EXISTS "Users can access their org data"    ON organizations;
DROP POLICY IF EXISTS "Users can access their outlet data" ON outlets;

CREATE POLICY "Users can access their org data"
  ON organizations
  FOR ALL
  USING (id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "Users can access their outlet data"
  ON outlets
  FOR ALL
  USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));

-- ── 1. user_profiles: allow each user to read/write their own row ────────────
DROP POLICY IF EXISTS "Users can manage own profile" ON user_profiles;
CREATE POLICY "Users can manage own profile"
  ON user_profiles
  FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ── Fix invoices RLS policy ───────────────────────────────────────────────────
--    The init migration's policy had no WITH CHECK, so INSERTs were blocked
--    unless outlet_id was already in user_profiles.outlet_ids.
--    New policy: allow read/write for any outlet belonging to the user's org.
DROP POLICY IF EXISTS "Outlet access" ON invoices;
CREATE POLICY "Outlet access"
  ON invoices
  FOR ALL
  USING (
    outlet_id IN (
      SELECT id FROM outlets
      WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets
      WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    )
  );

-- Fix the same pattern for all other transactional tables ────────────────────
DROP POLICY IF EXISTS "Outlet access" ON stock_ledger;
CREATE POLICY "Outlet access"
  ON stock_ledger FOR ALL
  USING (
    outlet_id IN (
      SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Outlet access" ON stock_batches;
CREATE POLICY "Outlet access"
  ON stock_batches FOR ALL
  USING (
    outlet_id IN (
      SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Outlet access" ON inventory_balance;
CREATE POLICY "Outlet access"
  ON inventory_balance FOR ALL
  USING (
    outlet_id IN (
      SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Outlet access" ON production_log;
CREATE POLICY "Outlet access"
  ON production_log FOR ALL
  USING (
    outlet_id IN (
      SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Outlet access" ON opname_log;
CREATE POLICY "Outlet access"
  ON opname_log FOR ALL
  USING (
    outlet_id IN (
      SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Outlet access" ON gl_entries;
CREATE POLICY "Outlet access"
  ON gl_entries FOR ALL
  USING (
    outlet_id IN (
      SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    )
  );

-- ── 2. chart_of_accounts: scoped to org ─────────────────────────────────────
DROP POLICY IF EXISTS "Org access" ON chart_of_accounts;
CREATE POLICY "Org access"
  ON chart_of_accounts
  FOR ALL
  USING  (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));

-- ── 3. item_master: scoped to org ───────────────────────────────────────────
DROP POLICY IF EXISTS "Org access" ON item_master;
CREATE POLICY "Org access"
  ON item_master
  FOR ALL
  USING  (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));

-- ── 4. bom: scoped to org ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org access" ON bom;
CREATE POLICY "Org access"
  ON bom
  FOR ALL
  USING  (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));

-- ── 5. user_integrations: scoped to the user themselves ─────────────────────
DROP POLICY IF EXISTS "Users can manage own integrations" ON user_integrations;
CREATE POLICY "Users can manage own integrations"
  ON user_integrations
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 6. invoice_lines: scoped to outlet (same pattern as invoices) ────────────
DROP POLICY IF EXISTS "Outlet access" ON invoice_lines;
CREATE POLICY "Outlet access"
  ON invoice_lines
  FOR ALL
  USING (
    invoice_id IN (
      SELECT id FROM invoices
      WHERE outlet_id = ANY(
        SELECT unnest(outlet_ids) FROM user_profiles WHERE id = auth.uid()
      )
    )
  );

-- ── 7. Add missing updated_at column to invoices ────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ── 8. Atomic registration RPC (SECURITY DEFINER bypasses RLS) ──────────────
--    Called from the client during sign-up to create org → outlet → profile
--    in a single transaction with no partial failure risk.
CREATE OR REPLACE FUNCTION public.register_new_org(
  p_user_id     UUID,
  p_full_name   TEXT,
  p_org_name    TEXT,
  p_outlet_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id    UUID;
  v_outlet_id UUID;
BEGIN
  -- Guard: prevent duplicate profiles (idempotent on retry)
  IF EXISTS (SELECT 1 FROM user_profiles WHERE id = p_user_id) THEN
    SELECT org_id INTO v_org_id FROM user_profiles WHERE id = p_user_id;
    SELECT id    INTO v_outlet_id FROM outlets WHERE org_id = v_org_id LIMIT 1;
    RETURN json_build_object('org_id', v_org_id, 'outlet_id', v_outlet_id);
  END IF;

  -- 1. Create organization
  INSERT INTO organizations (name)
  VALUES (p_org_name)
  RETURNING id INTO v_org_id;

  -- 2. Create first outlet
  INSERT INTO outlets (org_id, name)
  VALUES (v_org_id, p_outlet_name)
  RETURNING id INTO v_outlet_id;

  -- 3. Create user profile linked to org + outlet
  INSERT INTO user_profiles (id, org_id, full_name, role, outlet_ids)
  VALUES (p_user_id, v_org_id, p_full_name, 'owner', ARRAY[v_outlet_id]);

  -- 4. Seed Chart of Accounts
  INSERT INTO chart_of_accounts (org_id, code, name, type) VALUES
    (v_org_id, '1-0-00-000', 'CURRENT ASSETS', 'asset'),
    (v_org_id, '1-1-00-000', 'CASH, BANK & OTHER', 'asset'),
    (v_org_id, '1-1-10-000', 'CASH', 'asset'),
    (v_org_id, '1-1-10-010', 'House Bank - General Cashier', 'asset'),
    (v_org_id, '1-1-10-020', 'Petty Cash', 'asset'),
    (v_org_id, '1-1-10-030', 'Cash Clearance', 'asset'),
    (v_org_id, '1-1-10-040', 'Cash Outlet', 'asset'),
    (v_org_id, '1-1-20-000', 'BANK', 'asset'),
    (v_org_id, '1-1-20-010', 'BANK BCA', 'asset'),
    (v_org_id, '1-1-20-020', 'BANK BRI', 'asset'),
    (v_org_id, '1-1-20-030', 'BANK Mandiri', 'asset'),
    (v_org_id, '1-1-20-040', 'BANK BCA PC', 'asset'),
    (v_org_id, '1-2-00-000', 'ACCOUNT RECEIVABLE', 'asset'),
    (v_org_id, '1-2-10-000', 'CLEARANCE', 'asset'),
    (v_org_id, '1-2-10-010', 'AR Clearance', 'asset'),
    (v_org_id, '1-2-10-020', 'Guest Ledger', 'asset'),
    (v_org_id, '1-2-10-030', 'Down Payment', 'asset'),
    (v_org_id, '1-2-20-000', 'CITY LEDGER', 'asset'),
    (v_org_id, '1-2-20-010', 'AR - Credit Card', 'asset'),
    (v_org_id, '1-2-20-020', 'AR - Debit Card', 'asset'),
    (v_org_id, '1-2-20-030', 'AR - Transfer bank', 'asset'),
    (v_org_id, '1-2-20-040', 'AR - QR Mandiri', 'asset'),
    (v_org_id, '1-2-20-050', 'AR - EDC Mandiri', 'asset'),
    (v_org_id, '1-2-20-060', 'AR - Complimentary', 'asset'),
    (v_org_id, '1-2-20-070', 'AR - Other', 'asset'),
    (v_org_id, '1-2-30-000', 'OTHER RECEIVABLE', 'asset'),
    (v_org_id, '1-2-30-010', 'AR - Employe Loan', 'asset'),
    (v_org_id, '1-3-00-000', 'INVENTORIES', 'asset'),
    (v_org_id, '1-3-10-000', 'INV. KOH RAW MATERIAL', 'asset'),
    (v_org_id, '1-3-10-010', 'Inv - KOH Perishable', 'asset'),
    (v_org_id, '1-3-10-020', 'Inv - KOH Dairy & Egg', 'asset'),
    (v_org_id, '1-3-10-030', 'Inv - KOH Dry Store', 'asset'),
    (v_org_id, '1-3-10-040', 'Inv - KOH Sauce, Syrup & Condiment', 'asset'),
    (v_org_id, '1-3-10-050', 'Inv - KOH Frozen', 'asset'),
    (v_org_id, '1-3-10-060', 'Inv - KOH Traditional Cake, Bakery, Pastry & Lite Bite', 'asset'),
    (v_org_id, '1-3-20-000', 'INV. KOH WORK IN PROCESS', 'asset'),
    (v_org_id, '1-3-20-010', 'Inv - KOH WIP', 'asset'),
    (v_org_id, '1-3-30-000', 'INV. FOH RAW MATERIAL', 'asset'),
    (v_org_id, '1-3-30-010', 'Inv - FOH Perishable', 'asset'),
    (v_org_id, '1-3-30-020', 'Inv - FOH Dairy & Egg', 'asset'),
    (v_org_id, '1-3-30-030', 'Inv - FOH Dry Store', 'asset'),
    (v_org_id, '1-3-30-040', 'Inv - FOH Sauce, Syrup & Condiment', 'asset'),
    (v_org_id, '1-3-40-000', 'INV. FOH RTD INVENTORIES', 'asset'),
    (v_org_id, '1-3-40-010', 'Inv - FOH RTD', 'asset'),
    (v_org_id, '1-3-50-000', 'INV. FOH WORK IN PROCESS', 'asset'),
    (v_org_id, '1-3-50-010', 'Inv - FOH WIP', 'asset'),
    (v_org_id, '1-3-60-000', 'INV. STORAGE', 'asset'),
    (v_org_id, '1-3-60-010', 'Inv - ST Dry Store', 'asset'),
    (v_org_id, '1-3-60-020', 'Inv - ST Sauce, Syrup & Condiment', 'asset'),
    (v_org_id, '1-3-60-030', 'Inv - ST Frozen', 'asset'),
    (v_org_id, '1-4-00-000', 'PREPAID EXPENSES', 'asset'),
    (v_org_id, '1-4-10-000', 'PREPAID EXPENSES (-)', 'asset'),
    (v_org_id, '1-4-10-010', 'Building & Fire Insurance', 'asset'),
    (v_org_id, '1-4-10-020', 'Payroll & Related Expenses (*)', 'asset'),
    (v_org_id, '1-4-10-030', 'System Subscribe', 'asset'),
    (v_org_id, '1-4-10-040', 'Equipment & Machine Insurance', 'asset'),
    (v_org_id, '1-4-10-050', 'Rent & Occupancy Expense', 'asset'),
    (v_org_id, '1-4-10-060', 'Consultant Fee', 'asset'),
    (v_org_id, '1-4-10-070', 'Prepaid Taxes (*)', 'asset'),
    (v_org_id, '1-4-10-080', 'Miscellaneous Prepaid Expenses', 'asset'),
    (v_org_id, '1-5-00-000', 'OTHERS CURRENT ASSETS', 'asset'),
    (v_org_id, '1-5-10-000', 'OTHERS CURRENT ASSETS (-)', 'asset'),
    (v_org_id, '1-5-10-010', 'Barter Agreement', 'asset'),
    (v_org_id, '1-5-10-020', 'Deposit on Event (*)', 'asset'),
    (v_org_id, '1-5-10-030', 'Deposit on Purchase Contract', 'asset'),
    (v_org_id, '1-5-10-040', 'Travelling Expenses - Advance', 'asset'),
    (v_org_id, '1-5-10-050', 'Current Assets - Other', 'asset'),
    (v_org_id, '1-6-00-000', 'FIXED ASSETS', 'asset'),
    (v_org_id, '1-6-10-000', 'LAND Asset', 'asset'),
    (v_org_id, '1-6-10-010', 'Land', 'asset'),
    (v_org_id, '1-6-20-000', 'BUILDING Assets', 'asset'),
    (v_org_id, '1-6-20-010', 'Building', 'asset'),
    (v_org_id, '1-6-20-020', 'Building Improvement', 'asset'),
    (v_org_id, '1-6-30-000', 'FURNITURE, FIXTURE & EQUIPMENT (FFE)', 'asset'),
    (v_org_id, '1-6-30-010', 'Furniture', 'asset'),
    (v_org_id, '1-6-30-020', 'Fixture', 'asset'),
    (v_org_id, '1-6-30-030', 'Equipment Gol I', 'asset'),
    (v_org_id, '1-6-30-040', 'Equipment Gol II', 'asset'),
    (v_org_id, '1-6-60-000', 'OPERATING UTENSIL & EQUIPMENT', 'asset'),
    (v_org_id, '1-6-60-010', 'FOH Utensil', 'asset'),
    (v_org_id, '1-6-60-020', 'Kitchen Tool & Utensil', 'asset'),
    (v_org_id, '1-6-60-030', 'Back Of Office Tool', 'asset'),
    (v_org_id, '1-6-60-040', 'Chinaware,Glassware,Silverware', 'asset'),
    (v_org_id, '1-6-60-050', 'Human Capital Item', 'asset'),
    (v_org_id, '1-6-60-060', 'Beginning Purchase', 'asset'),
    (v_org_id, '1-7-00-000', 'OTHER FIXED ASSETS', 'asset'),
    (v_org_id, '1-7-10-000', 'OTHER FIXED ASSETS :', 'asset'),
    (v_org_id, '1-7-10-010', 'Other Fixed Assets - Organization Cost / Goodwill (*)', 'asset'),
    (v_org_id, '1-7-10-020', 'Grand Opening Expenses', 'asset'),
    (v_org_id, '1-7-10-030', 'Other Fixed Assets - Pre Opening Expenses', 'asset'),
    (v_org_id, '1-7-10-040', 'Assests In Transit', 'asset'),
    (v_org_id, '2-0-00-000', 'LIABILITIES', 'liability'),
    (v_org_id, '2-1-00-000', 'CURRENT LIABILITIES', 'liability'),
    (v_org_id, '2-1-10-000', 'TRADE CREDITOR', 'liability'),
    (v_org_id, '2-1-10-010', 'AP - Raw Material & Supplies', 'liability'),
    (v_org_id, '2-1-10-020', 'AP - Utility', 'liability'),
    (v_org_id, '2-1-10-030', 'AP - Suspense', 'liability'),
    (v_org_id, '2-1-10-040', 'AP - Other', 'liability'),
    (v_org_id, '2-1-20-000', 'TRADE TAXED', 'liability'),
    (v_org_id, '2-1-20-010', 'Tax - Pembangunan I (11%)', 'liability'),
    (v_org_id, '2-1-20-020', 'Tax - PPh 21', 'liability'),
    (v_org_id, '2-1-20-030', 'Tax - PPh 21 Kas Negara', 'liability'),
    (v_org_id, '2-1-30-000', 'TRADE OTHER', 'liability'),
    (v_org_id, '2-1-30-010', 'Service Charge (7%)', 'liability'),
    (v_org_id, '2-1-30-020', 'BPJS Ketenagakerjaan', 'liability'),
    (v_org_id, '2-1-30-030', 'BPJS Kesehatan', 'liability'),
    (v_org_id, '2-1-30-040', 'Consigment', 'liability'),
    (v_org_id, '2-1-30-050', 'Lost and Breakage Fund', 'liability'),
    (v_org_id, '2-1-30-060', 'Trade Other - Other', 'liability'),
    (v_org_id, '2-1-40-000', 'ACCRUED EXPENSES', 'liability'),
    (v_org_id, '2-1-40-010', 'A/E - Payroll & Related', 'liability'),
    (v_org_id, '2-2-00-000', 'LONG TERM LIABILITIES', 'liability'),
    (v_org_id, '2-2-10-000', 'SHORT TERM LIABILITIES', 'liability'),
    (v_org_id, '2-2-10-010', 'Bank Loan (Short Term)', 'liability'),
    (v_org_id, '2-2-10-020', 'Financial Institution (Non Bank) Loan (Short', 'liability'),
    (v_org_id, '2-2-10-030', 'Bank Loan (Long Term / Due in This Year)', 'liability'),
    (v_org_id, '2-2-10-040', 'Financial Institution Loan (Long Term / Due i', 'liability'),
    (v_org_id, '2-2-20-000', 'NOTES PAYABLE', 'liability'),
    (v_org_id, '2-2-20-010', 'Leasing Agreement', 'liability'),
    (v_org_id, '2-2-20-020', 'Promisory Not', 'liability'),
    (v_org_id, '2-2-20-030', 'Release Payment Account', 'liability'),
    (v_org_id, '2-2-30-000', 'LONG TERM LOAN', 'liability'),
    (v_org_id, '2-2-30-010', 'Bank Loan', 'liability'),
    (v_org_id, '2-2-30-020', 'Long Term Notes Payable', 'liability'),
    (v_org_id, '2-2-30-030', 'Long Term Loan - Other', 'liability'),
    (v_org_id, '3-0-00-000', 'CAPITAL', 'equity'),
    (v_org_id, '3-1-00-000', 'OTHER CAPITAL', 'equity'),
    (v_org_id, '3-1-10-000', 'Capital(-)', 'equity'),
    (v_org_id, '3-1-10-010', 'Capital Share', 'equity'),
    (v_org_id, '3-1-10-020', 'Retained Earning Beg. Year', 'equity'),
    (v_org_id, '3-1-10-030', 'Retained Earning', 'equity'),
    (v_org_id, '3-1-10-040', 'Retained Earning - TA', 'equity'),
    (v_org_id, '3-1-10-050', 'Profit & Loss Current Year', 'equity'),
    (v_org_id, '3-1-10-060', 'Paid Up Capital', 'equity'),
    (v_org_id, '3-1-10-070', 'Owner Withdrawal', 'equity'),
    (v_org_id, '3-1-10-080', 'Balance Forward', 'equity'),
    (v_org_id, '4-0-00-000', 'REVENUES', 'income'),
    (v_org_id, '4-1-00-000', 'FOOD & BEVERAGE REVENUE', 'income'),
    (v_org_id, '4-1-00-010', 'Food Revenue', 'income'),
    (v_org_id, '4-1-00-020', 'Beverage Revenue', 'income'),
    (v_org_id, '4-1-00-030', 'Traditional Cake, Bakery, Pastry & Lite Bite Revenue', 'income'),
    (v_org_id, '4-2-00-000', 'OTHER REVENUES', 'income'),
    (v_org_id, '4-2-00-010', 'Catering Outside', 'income'),
    (v_org_id, '4-2-00-020', 'Event', 'income'),
    (v_org_id, '4-2-00-030', 'Merchandise', 'income'),
    (v_org_id, '4-2-00-040', 'Miscellaneous (Other)', 'income'),
    (v_org_id, '5-0-00-000', 'COST OF GOODS SOLD', 'expense'),
    (v_org_id, '5-1-00-000', 'COGS FOOD', 'expense'),
    (v_org_id, '5-1-10-000', 'COST OF FOOD', 'expense'),
    (v_org_id, '5-1-10-010', 'Cost of Food Raw Material', 'expense'),
    (v_org_id, '5-1-10-020', 'Cost of WIP', 'expense'),
    (v_org_id, '5-1-10-030', 'Cost of Food Spoil / Waste', 'expense'),
    (v_org_id, '5-1-20-000', 'COST OF TRADITIONAL CAKE, BAKERY, PASTRY & LITE BITE', 'expense'),
    (v_org_id, '5-1-20-010', 'Cost of TBP&L Raw Material', 'expense'),
    (v_org_id, '5-1-20-020', 'Cost of WIP', 'expense'),
    (v_org_id, '5-2-00-000', 'COGS OF BEVERAGE', 'expense'),
    (v_org_id, '5-2-00-010', 'Cost of Bev Raw Material', 'expense'),
    (v_org_id, '5-2-00-020', 'Cost of Bev RTD', 'expense'),
    (v_org_id, '5-2-00-030', 'Cost of Bev WIP', 'expense'),
    (v_org_id, '5-2-00-040', 'Cost of Bev Spoil / Waste', 'expense'),
    (v_org_id, '5-3-00-000', 'COGS OTHER REVENUES', 'expense'),
    (v_org_id, '5-3-00-010', 'Cost of Catering Outside', 'expense'),
    (v_org_id, '5-3-00-020', 'Cost of Event', 'expense'),
    (v_org_id, '5-3-00-030', 'Cost of Merchandise', 'expense'),
    (v_org_id, '5-3-00-040', 'Cost of Miscellaneous', 'expense'),
    (v_org_id, '5-3-00-050', 'Cost of Variance', 'expense'),
    (v_org_id, '6-0-00-000', 'EXPENSES', 'expense'),
    (v_org_id, '6-1-00-000', 'SALARIES AND WAGES', 'expense'),
    (v_org_id, '6-1-00-010', 'KOH S&W', 'expense'),
    (v_org_id, '6-1-00-020', 'FOH S&W', 'expense'),
    (v_org_id, '6-1-00-030', 'Support and Marketing S&W', 'expense'),
    (v_org_id, '6-1-00-040', 'BOD S&W', 'expense'),
    (v_org_id, '6-1-00-050', 'Partners Benafit', 'expense'),
    (v_org_id, '6-2-00-000', 'SUPPLIES EXPENSES', 'expense'),
    (v_org_id, '6-2-00-010', 'Kitchen Supplies', 'expense'),
    (v_org_id, '6-2-00-020', 'Chemical, Cleaning and Sanitation Supplies', 'expense'),
    (v_org_id, '6-2-00-030', 'FOH Supplies', 'expense'),
    (v_org_id, '6-2-00-040', 'Packing Supplies', 'expense'),
    (v_org_id, '6-2-00-050', 'Office & Cashier Supplies', 'expense'),
    (v_org_id, '6-3-00-000', 'MARKETING EXPENSE', 'expense'),
    (v_org_id, '6-3-00-010', 'Marketing Production Expense', 'expense'),
    (v_org_id, '6-3-00-020', 'Marketing Entertainment Expense', 'expense'),
    (v_org_id, '6-3-00-030', 'Other Marketing Expense', 'expense'),
    (v_org_id, '6-4-00-000', 'PREMISES EXPENSE', 'expense'),
    (v_org_id, '6-4-00-010', 'Rent & Occupancy Expense', 'expense'),
    (v_org_id, '6-4-00-020', 'Repairs & Maintenance Expense', 'expense'),
    (v_org_id, '6-4-00-030', 'Cleaning, Sanitation, Security & Safety Expense', 'expense'),
    (v_org_id, '6-4-00-040', 'Electricity and Water', 'expense'),
    (v_org_id, '6-4-00-050', 'Building Tax, Other Tax, Fees & Insurance Expense', 'expense'),
    (v_org_id, '6-5-00-000', 'GENERAL EXPENSE', 'expense'),
    (v_org_id, '6-5-00-010', 'Administrative Expense', 'expense'),
    (v_org_id, '6-5-00-020', 'IT, System Subscribe & Software Expense', 'expense'),
    (v_org_id, '6-5-00-030', 'Communication and WIFI Expense', 'expense'),
    (v_org_id, '6-5-00-040', 'Research & Learning Development Expense', 'expense'),
    (v_org_id, '6-5-00-050', 'Transport & Travel Expense', 'expense'),
    (v_org_id, '6-5-00-060', 'Entertainment & Misc Expense', 'expense'),
    (v_org_id, '6-5-00-070', 'Bank Charge & MDR Expense', 'expense'),
    (v_org_id, '6-5-00-080', 'Other Expense', 'expense'),
    (v_org_id, '6-5-00-090', 'Food Cost Before Cut Off', 'expense'),
    (v_org_id, '6-5-00-100', 'Utility and Service Expense', 'expense'),
    (v_org_id, '7-0-00-000', 'FIXED CHARGE', 'expense'),
    (v_org_id, '7-1-00-000', 'DEPRECIATION EXPENSES', 'expense'),
    (v_org_id, '7-1-00-010', 'Building Assets DE', 'expense'),
    (v_org_id, '7-1-00-020', 'Furniture & Fixture Equipment  DE', 'expense'),
    (v_org_id, '7-1-00-030', 'Operating Utensil & Equipment  DE', 'expense'),
    (v_org_id, '7-1-00-040', 'Other DE', 'expense'),
    (v_org_id, '7-2-00-000', 'NON OPERATING INCOME', 'income'),
    (v_org_id, '7-2-00-010', 'Interest Earning', 'income'),
    (v_org_id, '7-2-00-020', 'Miscellaneous', 'income'),
    (v_org_id, '7-3-00-000', 'NON OPERATING EXPENSES', 'expense'),
    (v_org_id, '7-3-00-010', 'Rounding', 'expense'),
    (v_org_id, '7-3-00-020', 'Bank Interest', 'expense'),
    (v_org_id, '7-3-00-030', 'Loss On Disposal Of Asset', 'expense'),
    (v_org_id, '7-3-00-040', 'Other Non Operating Expense', 'expense');

  RETURN json_build_object('org_id', v_org_id, 'outlet_id', v_outlet_id);
END;
$$;

-- Grant execute to authenticated users (the function itself is SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION public.register_new_org(UUID, TEXT, TEXT, TEXT) TO authenticated;
-- Also allow anon to call it — the user just signed up and may not have a session cookie yet
GRANT EXECUTE ON FUNCTION public.register_new_org(UUID, TEXT, TEXT, TEXT) TO anon;
