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
    (v_org_id, '1-1-001', 'Kas',                   'asset'),
    (v_org_id, '1-1-002', 'Bank',                  'asset'),
    (v_org_id, '1-1-003', 'Piutang Usaha',          'asset'),
    (v_org_id, '1-1-004', 'Persediaan Bahan Baku',  'asset'),
    (v_org_id, '1-1-005', 'Persediaan WIP',         'asset'),
    (v_org_id, '1-2-001', 'Aset Tetap',             'asset'),
    (v_org_id, '2-1-001', 'Hutang Usaha',           'liability'),
    (v_org_id, '2-1-002', 'Hutang Pajak',           'liability'),
    (v_org_id, '3-1-001', 'Modal Pemilik',          'equity'),
    (v_org_id, '4-1-001', 'Pendapatan Makanan',     'income'),
    (v_org_id, '4-1-002', 'Pendapatan Minuman',     'income'),
    (v_org_id, '5-1-001', 'HPP Bahan Baku',         'expense'),
    (v_org_id, '5-1-002', 'HPP WIP Terpakai',       'expense'),
    (v_org_id, '6-1-001', 'Beban Operasional',      'expense'),
    (v_org_id, '6-1-002', 'Beban Utilitas',         'expense'),
    (v_org_id, '6-1-003', 'Beban Sewa',             'expense'),
    (v_org_id, '6-1-004', 'Beban Tenaga Kerja',     'expense');

  -- 5. Seed sample items
  INSERT INTO item_master (org_id, name, unit, category) VALUES
    (v_org_id, 'Telur Ayam',          'KG',   'raw'),
    (v_org_id, 'Tepung Terigu',       'KG',   'raw'),
    (v_org_id, 'Gula Pasir',          'KG',   'raw'),
    (v_org_id, 'Minyak Goreng',       'L',    'raw'),
    (v_org_id, 'Bawang Merah',        'KG',   'raw'),
    (v_org_id, 'Bumbu Dasar Merah',   'KG',   'wip'),
    (v_org_id, 'Adonan Roti',         'KG',   'wip'),
    (v_org_id, 'Nasi Goreng Spesial', 'porsi','recipe');

  RETURN json_build_object('org_id', v_org_id, 'outlet_id', v_outlet_id);
END;
$$;

-- Grant execute to authenticated users (the function itself is SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION public.register_new_org(UUID, TEXT, TEXT, TEXT) TO authenticated;
-- Also allow anon to call it — the user just signed up and may not have a session cookie yet
GRANT EXECUTE ON FUNCTION public.register_new_org(UUID, TEXT, TEXT, TEXT) TO anon;
