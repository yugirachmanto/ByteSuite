-- ============================================================
-- MIGRATION: 20240528000003_fix_global_imbalance.sql
-- Force-balances the entire general ledger by dumping any 
-- orphaned/unbalanced amounts into the Suspense Account.
-- ============================================================

DO $$
DECLARE
  v_suspense_coa_id UUID;
  v_org_id UUID;
  v_outlet_id UUID;
  v_total_debit NUMERIC;
  v_total_credit NUMERIC;
  v_diff NUMERIC;
BEGIN
  -- We assume one org for now, get the first org
  SELECT id INTO v_org_id FROM organizations LIMIT 1;
  IF v_org_id IS NULL THEN RETURN; END IF;

  SELECT id INTO v_outlet_id FROM outlets WHERE org_id = v_org_id LIMIT 1;
  IF v_outlet_id IS NULL THEN RETURN; END IF;
  
  -- Create Suspense Account if it doesn't exist
  SELECT id INTO v_suspense_coa_id FROM chart_of_accounts WHERE code = '9-9-99-999' AND org_id = v_org_id;
  IF v_suspense_coa_id IS NULL THEN
    INSERT INTO chart_of_accounts (org_id, code, name, type, level, is_header, is_active)
    VALUES (v_org_id, '9-9-99-999', 'Suspense Account (Unmapped Invoices)', 'expense', 1, false, true)
    RETURNING id INTO v_suspense_coa_id;
  END IF;

  -- Calculate the grand total of the entire GL
  SELECT SUM(debit), SUM(credit) INTO v_total_debit, v_total_credit FROM gl_entries;
  
  v_diff := COALESCE(v_total_debit, 0) - COALESCE(v_total_credit, 0);

  IF v_diff > 0 THEN
    -- Debit is higher, we need to add a Credit to balance it
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_type, description, created_at)
    VALUES (v_outlet_id, CURRENT_DATE, v_suspense_coa_id, 0, v_diff, 'manual', 'AUTO-FIX: Balancing historical ledger imbalance (Credit side)', NOW());
  ELSIF v_diff < 0 THEN
    -- Credit is higher, we need to add a Debit to balance it
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_type, description, created_at)
    VALUES (v_outlet_id, CURRENT_DATE, v_suspense_coa_id, ABS(v_diff), 0, 'manual', 'AUTO-FIX: Balancing historical ledger imbalance (Debit side)', NOW());
  END IF;

END;
$$;
