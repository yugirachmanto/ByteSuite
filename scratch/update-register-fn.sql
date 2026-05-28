-- Run this in Supabase SQL Editor to update the live register_new_org function.
-- Removes item seeding — new registrations will start with a clean item list.
-- The COA (Chart of Accounts) seed is kept because it's required for accounting.

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
  -- Guard: idempotent on retry
  IF EXISTS (SELECT 1 FROM user_profiles WHERE id = p_user_id) THEN
    SELECT org_id INTO v_org_id FROM user_profiles WHERE id = p_user_id;
    SELECT id    INTO v_outlet_id FROM outlets WHERE org_id = v_org_id LIMIT 1;
    RETURN json_build_object('org_id', v_org_id, 'outlet_id', v_outlet_id);
  END IF;

  -- 1. Create organization
  INSERT INTO organizations (name) VALUES (p_org_name) RETURNING id INTO v_org_id;

  -- 2. Create first outlet
  INSERT INTO outlets (org_id, name) VALUES (v_org_id, p_outlet_name) RETURNING id INTO v_outlet_id;

  -- 3. Create user profile
  INSERT INTO user_profiles (id, org_id, full_name, role, outlet_ids)
  VALUES (p_user_id, v_org_id, p_full_name, 'owner', ARRAY[v_outlet_id]);

  -- 4. Seed Chart of Accounts (required for GL/AP to work)
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

  -- NOTE: No item_master seeds — users add their own items.

  RETURN json_build_object('org_id', v_org_id, 'outlet_id', v_outlet_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_new_org(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_new_org(UUID, TEXT, TEXT, TEXT) TO anon;
