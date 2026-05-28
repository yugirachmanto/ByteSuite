CREATE OR REPLACE FUNCTION wipe_organization_data(p_org_id UUID)
RETURNS VOID AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  -- 1. Security Gate: Verify caller is owner of the targeted organization
  SELECT role INTO v_caller_role
  FROM public.user_profiles
  WHERE id = auth.uid() AND org_id = p_org_id;

  IF v_caller_role IS NULL OR v_caller_role != 'owner' THEN
    RAISE EXCEPTION 'Access Denied: Only the organization owner can perform a System Reset.';
  END IF;

  -- 2. Execute deletion in clean reverse-dependency order to satisfy all foreign keys
  
  -- A. Transactions & Logs
  DELETE FROM public.gl_entries WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);
  DELETE FROM public.gl_entries WHERE coa_id IN (SELECT id FROM public.chart_of_accounts WHERE org_id = p_org_id);

  DELETE FROM public.opname_log WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);
  DELETE FROM public.production_log WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);
  DELETE FROM public.inventory_balance WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);
  DELETE FROM public.stock_ledger WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);
  DELETE FROM public.stock_batches WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);
  DELETE FROM public.ap_payments WHERE org_id = p_org_id;
  
  -- B. Invoices & Lines
  DELETE FROM public.invoice_lines WHERE invoice_id IN (SELECT id FROM public.invoices WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id));
  DELETE FROM public.invoice_lines WHERE coa_id IN (SELECT id FROM public.chart_of_accounts WHERE org_id = p_org_id);
  DELETE FROM public.invoices WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);

  -- C. Master Setup & Catalogs
  DELETE FROM public.bom WHERE org_id = p_org_id;
  DELETE FROM public.product_prices WHERE org_id = p_org_id;
  DELETE FROM public.item_master WHERE org_id = p_org_id;

  -- D. Account Configurations & Integrations
  DELETE FROM public.default_coa_mappings WHERE org_id = p_org_id;
  DELETE FROM public.pph_rules WHERE org_id = p_org_id;
  DELETE FROM public.user_integrations WHERE org_id = p_org_id;

  -- E. Chart of Accounts (Nullify parent self-references first)
  UPDATE public.chart_of_accounts SET parent_id = NULL WHERE org_id = p_org_id;
  DELETE FROM public.chart_of_accounts WHERE org_id = p_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
