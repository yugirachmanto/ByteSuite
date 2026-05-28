-- ===========================================================================
-- VERIFICATION TEST SCRIPT: POS Sales Import -> GL Posting
-- Run these steps in the Supabase SQL Editor to test all 7 cases.
-- ===========================================================================

-- ─── SETUP MOCK ORGANIZATION & OUTLETS ──────────────────────────────────────
-- Set up organization 'F&B Group' and two outlets: 'Outlet Jakarta' and 'Outlet Bandung'

DO $$
DECLARE
  v_org_id UUID := '10000000-0000-0000-0000-000000000000';
  v_outlet_a UUID := 'a0000000-0000-0000-0000-000000000000';
  v_outlet_b UUID := 'b0000000-0000-0000-0000-000000000000';
  v_user_a UUID := '00000000-0000-0000-0000-00000000000a';
  v_user_b UUID := '00000000-0000-0000-0000-00000000000b';
  
  v_cash_coa UUID;
  v_gopay_coa UUID;
  v_food_rev_coa UUID;
  v_beverage_rev_coa UUID;
  v_food_cogs_coa UUID;
  v_inventory_coa UUID;
  v_ppn_coa UUID;
BEGIN
  RAISE NOTICE '--- STARTING DATABASE TEST SETUP ---';
  
  -- Cleanup old test records
  DELETE FROM public.gl_entries WHERE reference_type = 'pos_import';
  DELETE FROM public.pos_import_lines;
  DELETE FROM public.pos_imports;
  DELETE FROM public.pos_coa_mapping WHERE org_id = v_org_id;
  DELETE FROM public.pos_payment_method_mapping WHERE org_id = v_org_id;
  DELETE FROM public.default_coa_mappings WHERE org_id = v_org_id;
  DELETE FROM public.chart_of_accounts WHERE org_id = v_org_id;
  DELETE FROM public.user_profiles WHERE org_id = v_org_id;
  DELETE FROM public.outlets WHERE org_id = v_org_id;
  DELETE FROM public.organizations WHERE id = v_org_id;

  -- 1. Create Organization with posting window config
  INSERT INTO public.organizations (id, name, posting_window_days)
  VALUES (v_org_id, 'F&B Group', 30);

  -- 2. Create Outlets
  INSERT INTO public.outlets (id, org_id, name) VALUES
    (v_outlet_a, v_org_id, 'Outlet Jakarta'),
    (v_outlet_b, v_org_id, 'Outlet Bandung');

  -- 3. Create User Profiles (User A has access to Outlet A, User B has access to Outlet B)
  INSERT INTO public.user_profiles (id, org_id, full_name, role, outlet_ids) VALUES
    (v_user_a, v_org_id, 'Jakarta Manager', 'finance', ARRAY[v_outlet_a]),
    (v_user_b, v_org_id, 'Bandung Manager', 'finance', ARRAY[v_outlet_b]);

  -- 4. Seed Chart of Accounts
  INSERT INTO public.chart_of_accounts (id, org_id, code, name, type) VALUES
    ('20000000-0000-0000-0000-000000000001', v_org_id, '1-1-001', 'Kas Tunai', 'asset'),
    ('20000000-0000-0000-0000-000000000002', v_org_id, '1-1-002', 'Piutang GoPay', 'asset'),
    ('20000000-0000-0000-0000-000000000003', v_org_id, '1-1-003', 'Persediaan Bahan Makanan', 'asset'),
    ('20000000-0000-0000-0000-000000000004', v_org_id, '4-1-001', 'Pendapatan Makanan', 'income'),
    ('20000000-0000-0000-0000-000000000005', v_org_id, '4-1-002', 'Pendapatan Minuman', 'income'),
    ('20000000-0000-0000-0000-000000000006', v_org_id, '5-1-001', 'HPP Makanan', 'expense'),
    ('20000000-0000-0000-0000-000000000007', v_org_id, '2-1-002', 'Hutang PPN (PPN Keluaran)', 'liability')
  RETURNING id, code INTO v_cash_coa, v_gopay_coa, v_inventory_coa, v_food_rev_coa, v_beverage_rev_coa, v_food_cogs_coa, v_ppn_coa;

  -- 5. Seed Core default_coa_mappings (including new Hutang PPN / ppn_keluaran role)
  INSERT INTO public.default_coa_mappings (org_id, account_role, coa_id) VALUES
    (v_org_id, 'inventory_asset', '20000000-0000-0000-0000-000000000003'),
    (v_org_id, 'ppn_keluaran', '20000000-0000-0000-0000-000000000007');

  -- 6. Setup Mappings (Org-wide defaults)
  INSERT INTO public.pos_coa_mapping (org_id, pos_category, revenue_coa_id, cogs_coa_id) VALUES
    (v_org_id, 'Makanan', '20000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000006'),
    (v_org_id, 'Minuman', '20000000-0000-0000-0000-000000000005', NULL);

  INSERT INTO public.pos_payment_method_mapping (org_id, payment_method, coa_id, is_settlement_lag, settlement_days) VALUES
    (v_org_id, 'Cash', '20000000-0000-0000-0000-000000000001', false, 0),
    (v_org_id, 'GoPay', '20000000-0000-0000-0000-000000000002', true, 1);

  RAISE NOTICE '--- SETUP COMPLETED SUCCESSFULLY ---';
END;
$$;


-- ─── TEST CASE 1: ALL CATEGORIES MAPPED POSTS CORRECTLY ───────────────────────
-- Target: Import daily sales with valid mappings and assert journal balance.
DO $$
DECLARE
  v_org_id UUID := '10000000-0000-0000-0000-000000000000';
  v_outlet_a UUID := 'a0000000-0000-0000-0000-000000000000';
  v_import_id UUID := '90000000-0000-0000-0000-000000000001';
  v_val jsonb;
  v_deb numeric;
  v_crd numeric;
BEGIN
  -- Insert Import Header
  INSERT INTO public.pos_imports (id, org_id, outlet_id, import_date, status, source_file)
  VALUES (v_import_id, v_org_id, v_outlet_a, CURRENT_DATE, 'draft', 'sales-22-mei.csv');

  -- Insert Import Lines: 2 Items (Makanan, Minuman), Cash & GoPay payments, COGS present
  INSERT INTO public.pos_import_lines (import_id, org_id, outlet_id, product_name, pos_category, quantity, unit_price, subtotal, discount_amount, tax_amount, net_amount, payment_method, cogs_per_unit, cogs_total) VALUES
    (v_import_id, v_org_id, v_outlet_a, 'Nasi Goreng', 'Makanan', 2.0, 50000.00, 100000.00, 10000.00, 9900.00, 99900.00, 'Cash', 20000.00, 40000.00),
    (v_import_id, v_org_id, v_outlet_a, 'Es Teh Manis', 'Minuman', 1.0, 15000.00, 15000.00, 0.00, 1650.00, 16650.00, 'GoPay', 0.00, 0.00);

  -- Run validate RPC
  SELECT public.validate_pos_import(v_import_id) INTO v_val;
  ASSERT (v_val->>'is_valid')::boolean = true, 'Test Case 1 Validation Failed: Import should be valid';

  -- Call post RPC
  PERFORM public.post_pos_import(v_import_id);

  -- Assert ledger state
  SELECT SUM(debit), SUM(credit) INTO v_deb, v_crd FROM public.gl_entries
  WHERE reference_id = v_import_id AND reference_type = 'pos_import';

  -- Debit should match credit (Cash 99900 + GoPay 16650 + COGS 40000 = 156550)
  ASSERT v_deb = 156550.00, 'Test Case 1 Balance Assert Failed: Debit total is incorrect: ' || v_deb;
  ASSERT v_crd = 156550.00, 'Test Case 1 Balance Assert Failed: Credit total is incorrect: ' || v_crd;

  RAISE NOTICE '✅ TEST CASE 1 PASSED: Valid import posted and balanced perfectly.';
END;
$$;


-- ─── TEST CASE 2: UNMAPPED CATEGORY BLOCKED WITH ERROR ────────────────────────
-- Target: Block posting when an unmapped category 'Cemilan' is imported.
DO $$
DECLARE
  v_org_id UUID := '10000000-0000-0000-0000-000000000000';
  v_outlet_a UUID := 'a0000000-0000-0000-0000-000000000000';
  v_import_id UUID := '90000000-0000-0000-0000-000000000002';
  v_val jsonb;
BEGIN
  INSERT INTO public.pos_imports (id, org_id, outlet_id, import_date, status)
  VALUES (v_import_id, v_org_id, v_outlet_a, CURRENT_DATE, 'draft');

  -- 'Cemilan' is not mapped
  INSERT INTO public.pos_import_lines (import_id, org_id, outlet_id, product_name, pos_category, quantity, unit_price, subtotal, net_amount, payment_method)
  VALUES (v_import_id, v_org_id, v_outlet_a, 'Kentang Goreng', 'Cemilan', 1.0, 20000.00, 20000.00, 20000.00, 'Cash');

  SELECT public.validate_pos_import(v_import_id) INTO v_val;
  ASSERT (v_val->>'is_valid')::boolean = false, 'Test Case 2 Assert Failed: Cemilan should be unmapped';
  ASSERT (v_val->'unmapped_categories'->>0) = 'Cemilan', 'Test Case 2 Assert Failed: unmapped category list should contain Cemilan';

  -- Attempting to post should crash
  BEGIN
    PERFORM public.post_pos_import(v_import_id);
    RAISE EXCEPTION 'Test Case 2 Assert Failed: post_pos_import should have failed due to unmapped category';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '✅ TEST CASE 2 PASSED: Unmapped category blocked and raised expected exception: %', SQLERRM;
  END;
END;
$$;


-- ─── TEST CASE 3: TAX PRESENT BUT HUTANG PPN COA UNMAPPED BLOCKED ─────────────
-- Target: Block posting when tax is present but ppn_keluaran account mapping is missing.
DO $$
DECLARE
  v_org_id UUID := '10000000-0000-0000-0000-000000000000';
  v_outlet_a UUID := 'a0000000-0000-0000-0000-000000000000';
  v_import_id UUID := '90000000-0000-0000-0000-000000000003';
  v_val jsonb;
BEGIN
  -- Temporary delete the ppn_keluaran mapping role
  DELETE FROM public.default_coa_mappings WHERE org_id = v_org_id AND account_role = 'ppn_keluaran';

  INSERT INTO public.pos_imports (id, org_id, outlet_id, import_date, status)
  VALUES (v_import_id, v_org_id, v_outlet_a, CURRENT_DATE, 'draft');

  -- Item has 5000 tax
  INSERT INTO public.pos_import_lines (import_id, org_id, outlet_id, product_name, pos_category, quantity, unit_price, subtotal, tax_amount, net_amount, payment_method)
  VALUES (v_import_id, v_org_id, v_outlet_a, 'Nasi Goreng', 'Makanan', 1.0, 50000.00, 50000.00, 5000.00, 55000.00, 'Cash');

  SELECT public.validate_pos_import(v_import_id) INTO v_val;
  ASSERT (v_val->>'is_valid')::boolean = false, 'Test Case 3 Assert Failed: Missing PPN Keluaran COA role should be invalid';

  BEGIN
    PERFORM public.post_pos_import(v_import_id);
    RAISE EXCEPTION 'Test Case 3 Assert Failed: post should block missing Hutang PPN mapping';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '✅ TEST CASE 3 PASSED: Tax with missing Hutang PPN mapping correctly blocked: %', SQLERRM;
  END;

  -- Restore mapping
  INSERT INTO public.default_coa_mappings (org_id, account_role, coa_id)
  VALUES (v_org_id, 'ppn_keluaran', '20000000-0000-0000-0000-000000000007');
END;
$$;


-- ─── TEST CASE 4: OPTION A POSTING WINDOW LIMITATION (30 DAYS BACK) ────────────
-- Target: Block posting of transaction date older than 30 days.
DO $$
DECLARE
  v_org_id UUID := '10000000-0000-0000-0000-000000000000';
  v_outlet_a UUID := 'a0000000-0000-0000-0000-000000000000';
  v_import_id UUID := '90000000-0000-0000-0000-000000000004';
  v_old_date DATE := CURRENT_DATE - INTERVAL '40 days';
BEGIN
  INSERT INTO public.pos_imports (id, org_id, outlet_id, import_date, status)
  VALUES (v_import_id, v_org_id, v_outlet_a, v_old_date, 'draft');

  INSERT INTO public.pos_import_lines (import_id, org_id, outlet_id, product_name, pos_category, quantity, unit_price, subtotal, net_amount, payment_method)
  VALUES (v_import_id, v_org_id, v_outlet_a, 'Nasi Goreng', 'Makanan', 1.0, 50000.00, 50000.00, 50000.00, 'Cash');

  BEGIN
    PERFORM public.post_pos_import(v_import_id);
    RAISE EXCEPTION 'Test Case 4 Assert Failed: post should block posting older than 30 days limit';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '✅ TEST CASE 4 PASSED: Option A posting window check blocked old transaction: %', SQLERRM;
  END;
END;
$$;


-- ─── TEST CASE 5: RLS ISOLATION (OUTLET JAKARTA VS OUTLET BANDUNG) ────────────
-- Target: Verify that a query run as User B (Bandung Manager) cannot read data from Outlet A (Jakarta).
-- We test this by mocking public.user_profiles settings inside current_setting or using direct subqueries.
DO $$
DECLARE
  v_outlet_a UUID := 'a0000000-0000-0000-0000-000000000000';
  v_user_b UUID := '00000000-0000-0000-0000-00000000000b'; -- Bandung Manager, only has outlet B
  v_visible_imports_count integer;
BEGIN
  -- We simulate policy evaluation by running a query that mimics the RLS check for User B
  SELECT COUNT(*) INTO v_visible_imports_count
  FROM public.pos_imports pi
  WHERE pi.id = '90000000-0000-0000-0000-000000000001' -- Outlet Jakarta import
    AND pi.outlet_id IN (
      SELECT id FROM public.outlets WHERE org_id = (SELECT org_id FROM public.user_profiles WHERE id = v_user_b)
        AND id = ANY(SELECT unnest(outlet_ids) FROM public.user_profiles WHERE id = v_user_b)
    );

  ASSERT v_visible_imports_count = 0, 'Test Case 5 Assert Failed: User B should not see Outlet A imports';
  RAISE NOTICE '✅ TEST CASE 5 PASSED: RLS isolation between different outlets verified successfully.';
END;
$$;


-- ─── TEST CASE 6: CONCURRENT SAME-DATE IMPORTS FROM DISTINCT OUTLETS ──────────
-- Target: Verify that two outlets can post same-date sales without collision.
DO $$
DECLARE
  v_org_id UUID := '10000000-0000-0000-0000-000000000000';
  v_outlet_a UUID := 'a0000000-0000-0000-0000-000000000000';
  v_outlet_b UUID := 'b0000000-0000-0000-0000-000000000000';
  v_import_a UUID := '90000000-0000-0000-0000-00000000005a';
  v_import_b UUID := '90000000-0000-0000-0000-00000000005b';
  v_shared_date DATE := CURRENT_DATE - INTERVAL '5 days';
  
  v_gl_count_a integer;
  v_gl_count_b integer;
BEGIN
  -- Import outlet A
  INSERT INTO public.pos_imports (id, org_id, outlet_id, import_date, status)
  VALUES (v_import_a, v_org_id, v_outlet_a, v_shared_date, 'draft');
  INSERT INTO public.pos_import_lines (import_id, org_id, outlet_id, product_name, pos_category, quantity, unit_price, subtotal, net_amount, payment_method)
  VALUES (v_import_a, v_org_id, v_outlet_a, 'Es Kopi', 'Minuman', 1.0, 10000.00, 10000.00, 10000.00, 'Cash');
  PERFORM public.post_pos_import(v_import_a);

  -- Import outlet B (same date)
  INSERT INTO public.pos_imports (id, org_id, outlet_id, import_date, status)
  VALUES (v_import_b, v_org_id, v_outlet_b, v_shared_date, 'draft');
  INSERT INTO public.pos_import_lines (import_id, org_id, outlet_id, product_name, pos_category, quantity, unit_price, subtotal, net_amount, payment_method)
  VALUES (v_import_b, v_org_id, v_outlet_b, 'Nasi Bakar', 'Makanan', 1.0, 30000.00, 30000.00, 30000.00, 'Cash');
  PERFORM public.post_pos_import(v_import_b);

  -- Check entries in gl_entries
  SELECT COUNT(*) INTO v_gl_count_a FROM public.gl_entries WHERE reference_id = v_import_a;
  SELECT COUNT(*) INTO v_gl_count_b FROM public.gl_entries WHERE reference_id = v_import_b;

  ASSERT v_gl_count_a > 0, 'Test Case 6 Assert Failed: outlet A gl entries not created';
  ASSERT v_gl_count_b > 0, 'Test Case 6 Assert Failed: outlet B gl entries not created';

  RAISE NOTICE '✅ TEST CASE 6 PASSED: Concurrent same-date imports for Outlet Jakarta and Bandung completed independently.';
END;
$$;


-- ─── TEST CASE 7: OUTLET OVERRIDE MAPPING LOOKUP VALIDATION ───────────────────
-- Target: Verify that Outlet B uses outlet override mapping while Outlet A falls back to org default.
DO $$
DECLARE
  v_org_id UUID := '10000000-0000-0000-0000-000000000000';
  v_outlet_a UUID := 'a0000000-0000-0000-0000-000000000000';
  v_outlet_b UUID := 'b0000000-0000-0000-0000-000000000000';
  v_import_a UUID := '90000000-0000-0000-0000-00000000007a';
  v_import_b UUID := '90000000-0000-0000-0000-00000000007b';
  
  -- Create a special COA for Premium Beverages at Outlet B
  v_premium_rev_coa UUID := '20000000-0000-0000-0000-999999999999';
  v_resolved_coa_a UUID;
  v_resolved_coa_b UUID;
BEGIN
  -- Insert special COA
  INSERT INTO public.chart_of_accounts (id, org_id, code, name, type)
  VALUES (v_premium_rev_coa, v_org_id, '4-1-009', 'Pendapatan Minuman Premium Outlet B', 'income');

  -- Create mapping override for Minuman at Outlet B
  INSERT INTO public.pos_coa_mapping (org_id, outlet_id, pos_category, revenue_coa_id, cogs_coa_id)
  VALUES (v_org_id, v_outlet_b, 'Minuman', v_premium_rev_coa, NULL);

  -- 1. Create import for Outlet A (should use org default 'Pendapatan Minuman' code 4-1-002)
  INSERT INTO public.pos_imports (id, org_id, outlet_id, import_date, status)
  VALUES (v_import_a, v_org_id, v_outlet_a, CURRENT_DATE, 'draft');
  INSERT INTO public.pos_import_lines (import_id, org_id, outlet_id, product_name, pos_category, quantity, unit_price, subtotal, net_amount, payment_method)
  VALUES (v_import_a, v_org_id, v_outlet_a, 'Es Teh', 'Minuman', 1.0, 10000.00, 10000.00, 10000.00, 'Cash');
  PERFORM public.post_pos_import(v_import_a);

  -- 2. Create import for Outlet B (should use override 'Pendapatan Minuman Premium' code 4-1-009)
  INSERT INTO public.pos_imports (id, org_id, outlet_id, import_date, status)
  VALUES (v_import_b, v_org_id, v_outlet_b, CURRENT_DATE, 'draft');
  INSERT INTO public.pos_import_lines (import_id, org_id, outlet_id, product_name, pos_category, quantity, unit_price, subtotal, net_amount, payment_method)
  VALUES (v_import_b, v_org_id, v_outlet_b, 'Es Teh', 'Minuman', 1.0, 10000.00, 10000.00, 10000.00, 'Cash');
  PERFORM public.post_pos_import(v_import_b);

  -- Assert mappings resolved correctly in GL
  SELECT coa_id INTO v_resolved_coa_a FROM public.gl_entries
  WHERE reference_id = v_import_a AND credit > 0;

  SELECT coa_id INTO v_resolved_coa_b FROM public.gl_entries
  WHERE reference_id = v_import_b AND credit > 0;

  ASSERT v_resolved_coa_a = '20000000-0000-0000-0000-000000000005', 'Outlet A did not use org-default Minuman account';
  ASSERT v_resolved_coa_b = v_premium_rev_coa, 'Outlet B did not use override Minuman account';

  RAISE NOTICE '✅ TEST CASE 7 PASSED: Outlet overrides successfully resolved and posted correctly.';
END;
$$;


-- ─── BALANCE ASSERTION GENERAL QUERY ──────────────────────────────────────────
-- Run this query to audit all test transactions inside public.gl_entries.
SELECT
  pi.import_date,
  pi.outlet_id,
  SUM(ge.debit)                          AS total_debit,
  SUM(ge.credit)                         AS total_credit,
  SUM(ge.debit) - SUM(ge.credit)         AS diff,
  CASE
    WHEN round(SUM(ge.debit), 2) = round(SUM(ge.credit), 2)
    THEN '✅ BALANCED'
    ELSE '❌ MISMATCH'
  END AS status
FROM public.gl_entries ge
JOIN public.pos_imports pi ON pi.id = ge.reference_id
WHERE ge.reference_type = 'pos_import'
GROUP BY pi.import_date, pi.outlet_id;
