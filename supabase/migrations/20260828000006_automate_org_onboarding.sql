-- Automate the parts of org onboarding that were previously entirely manual:
-- COA hierarchy computation and default account-role mappings.
--
-- register_new_org already seeded a full ~200-account chart of accounts, but
-- never called repair_coa_hierarchy() afterward — every new org's accounts
-- sat with is_header = false / level = 1 (the column defaults) regardless of
-- their actual position in the tree, until someone happened to trigger a
-- repair some other way. It also never created any default_coa_mappings
-- rows, so every invoice with tax or a separately-posted freight amount was
-- guaranteed to fail until a human found Settings > Accounting and set
-- Accounts Payable / PPN Masukan / PPN Keluaran / Freight Expense by hand —
-- this is the exact class of bug this session spent multiple fixes on.
--
-- Two of those four roles (Accounts Payable, Freight Expense) already have a
-- clean match in the seeded COA (2-1-10-010 and 6-5-00-050 respectively —
-- confirmed these are the exact codes post_invoice's own fallback resolution
-- already searches for). The seed had no PPN Masukan/Keluaran account at
-- all, so this migration adds both before mapping them. PPH roles are left
-- unmapped — no existing seeded account fits them well and they're a
-- genuinely optional setup step, not a blocker.
--
-- Bonus fix found while actually exercising repair_coa_hierarchy() for the
-- first time (tested inside a rolled-back transaction against real seed
-- data): every top-level code like "1-0-00-000" matched itself as its own
-- parent, because the 4-part-code parent lookup builds the candidate parent
-- code from the row's own segments with no check that the result isn't the
-- row's own code. With every single row ending up with a non-null parent_id
-- (confirmed: 216/216 in a test run), the recursive level calculation's
-- anchor (`WHERE parent_id IS NULL`) matched nothing, so `level` silently
-- never advanced past its default of 1 for any account, ever, for any org.
-- Fixed by excluding the row's own id from each parent candidate lookup.

CREATE OR REPLACE FUNCTION public.repair_coa_hierarchy(p_org_id UUID)
RETURNS VOID AS $$
DECLARE
  r RECORD;
  v_parts TEXT[];
  v_p1_code TEXT;
  v_p2_code TEXT;
  v_p3_code TEXT;
  v_parent_id UUID;
BEGIN
  -- 1. Reset all parents to NULL, default level = 1, is_header = false
  UPDATE public.chart_of_accounts
  SET parent_id = NULL, level = 1, is_header = false
  WHERE org_id = p_org_id;

  -- 2. Scan and set parent_id using segment matching
  FOR r IN
    SELECT id, code FROM public.chart_of_accounts
    WHERE org_id = p_org_id
  LOOP
    v_parts := regexp_split_to_array(r.code, '-');
    v_parent_id := NULL;

    IF array_length(v_parts, 1) = 3 THEN
      -- Standard 3-part code (e.g. 1-1-001)
      -- Parent is Group (e.g. 1-1-000 or 1-1-00-000)
      v_p2_code := v_parts[1] || '-' || v_parts[2] || '-000';
      SELECT id INTO v_parent_id FROM public.chart_of_accounts
      WHERE org_id = p_org_id AND id != r.id
        AND (code = v_p2_code OR code = v_parts[1] || '-' || v_parts[2] || '-00-000') LIMIT 1;

      -- Fallback to Class (e.g. 1-0-000 or 1-0-00-000)
      IF v_parent_id IS NULL THEN
        v_p1_code := v_parts[1] || '-0-000';
        SELECT id INTO v_parent_id FROM public.chart_of_accounts
        WHERE org_id = p_org_id AND id != r.id
          AND (code = v_p1_code OR code = v_parts[1] || '-0-00-000') LIMIT 1;
      END IF;

    ELSIF array_length(v_parts, 1) = 4 THEN
      -- Standard 4-part code (e.g. 1-1-20-010)
      -- Parent is Sub-Group (e.g. 1-1-20-000 or 1-1-20-00-000)
      v_p3_code := v_parts[1] || '-' || v_parts[2] || '-' || v_parts[3] || '-000';
      SELECT id INTO v_parent_id FROM public.chart_of_accounts
      WHERE org_id = p_org_id AND id != r.id
        AND (code = v_p3_code OR code = v_parts[1] || '-' || v_parts[2] || '-' || v_parts[3] || '-00-000') LIMIT 1;

      -- Fallback to Group (e.g. 1-1-00-000 or 1-1-000)
      IF v_parent_id IS NULL THEN
        v_p2_code := v_parts[1] || '-' || v_parts[2] || '-000';
        SELECT id INTO v_parent_id FROM public.chart_of_accounts
        WHERE org_id = p_org_id AND id != r.id
          AND (code = v_p2_code OR code = v_parts[1] || '-' || v_parts[2] || '-00-000') LIMIT 1;
      END IF;
    END IF;

    -- Link parent
    IF v_parent_id IS NOT NULL THEN
      UPDATE public.chart_of_accounts SET parent_id = v_parent_id WHERE id = r.id;
    END IF;
  END LOOP;

  -- 3. Update is_header flags based on actual children
  UPDATE public.chart_of_accounts
  SET is_header = true
  WHERE org_id = p_org_id
    AND id IN (
      SELECT DISTINCT parent_id
      FROM public.chart_of_accounts
      WHERE org_id = p_org_id AND parent_id IS NOT NULL
    );

  -- 4. Calculate levels recursively
  WITH RECURSIVE coa_levels AS (
    SELECT id, 1 AS calculated_level
    FROM public.chart_of_accounts
    WHERE org_id = p_org_id AND parent_id IS NULL

    UNION ALL

    SELECT child.id, parent.calculated_level + 1
    FROM public.chart_of_accounts child
    JOIN coa_levels parent ON child.parent_id = parent.id
    WHERE child.org_id = p_org_id
  )
  UPDATE public.chart_of_accounts c
  SET level = l.calculated_level
  FROM coa_levels l
  WHERE c.id = l.id AND c.org_id = p_org_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.repair_coa_hierarchy(UUID) TO authenticated;

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
    (v_org_id, '1-2-30-020', 'PPN Masukan (Input VAT)', 'asset'),
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
    (v_org_id, '2-1-20-040', 'PPN Keluaran (Output VAT)', 'liability'),
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

  -- 5. Compute is_header / level / parent_id for the whole tree just seeded —
  -- previously never called anywhere, so every new org's COA sat with
  -- is_header = false on every row (the column default) regardless of
  -- whether it was actually a header account.
  PERFORM repair_coa_hierarchy(v_org_id);

  -- 6. Seed default account-role mappings so invoices can post from day one
  -- without a trip to Settings > Accounting first. SELECT ... WHERE code = 'X'
  -- is a no-op (not an error) if a code is ever missing.
  INSERT INTO default_coa_mappings (org_id, account_role, coa_id)
  SELECT v_org_id, 'accounts_payable', id FROM chart_of_accounts WHERE org_id = v_org_id AND code = '2-1-10-010'
  UNION ALL
  SELECT v_org_id, 'freight_expense', id FROM chart_of_accounts WHERE org_id = v_org_id AND code = '6-5-00-050'
  UNION ALL
  SELECT v_org_id, 'ppn_masukan', id FROM chart_of_accounts WHERE org_id = v_org_id AND code = '1-2-30-020'
  UNION ALL
  SELECT v_org_id, 'ppn_keluaran', id FROM chart_of_accounts WHERE org_id = v_org_id AND code = '2-1-20-040';

  RETURN json_build_object('org_id', v_org_id, 'outlet_id', v_outlet_id);
END;
$$;

-- Grants unchanged — already present from the original migration, re-stated
-- here defensively since CREATE OR REPLACE can in rare setups reset them.
GRANT EXECUTE ON FUNCTION public.register_new_org(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_new_org(UUID, TEXT, TEXT, TEXT) TO anon;

-- One-time backfill: re-run the now-fixed repair_coa_hierarchy for every
-- existing org, since the self-parenting bug above meant every org's COA
-- (not just future signups) has had level stuck at 1 on every account since
-- the feature was introduced. Safe to run — the function resets and
-- recomputes deterministically from each org's own chart_of_accounts.code
-- values, it doesn't depend on any prior state.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM organizations LOOP
    PERFORM repair_coa_hierarchy(r.id);
  END LOOP;
END;
$$;
