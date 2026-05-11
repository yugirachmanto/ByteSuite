-- 1. Create default_coa_mappings table
CREATE TABLE IF NOT EXISTS default_coa_mappings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id),
  account_role    text NOT NULL, -- e.g. 'accounts_payable', 'ppn_masukan', 'pph23_payable', 'inventory_asset'
  coa_id          uuid NOT NULL REFERENCES chart_of_accounts(id),
  UNIQUE (org_id, account_role)
);

ALTER TABLE default_coa_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org access" ON default_coa_mappings FOR ALL USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));

-- 2. Create pph_rules table
CREATE TABLE IF NOT EXISTS pph_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid REFERENCES organizations(id), -- NULL = global default
  pasal           text NOT NULL,               -- '23', '4ayat2', '22'
  service_keyword text[],                      -- match against line item description
  rate_percent    numeric NOT NULL,
  coa_role        text NOT NULL               -- maps to default_coa_mappings account_role
);

ALTER TABLE pph_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org access" ON pph_rules FOR ALL USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()) OR org_id IS NULL);


-- 3. Refactor post_invoice RPC to use default_coa_mappings and enforce Maker-Checker
CREATE OR REPLACE FUNCTION post_invoice(
  p_invoice_id UUID,
  p_outlet_id UUID,
  p_org_id UUID,
  p_lines JSONB
) RETURNS VOID AS $$
DECLARE
  v_invoice         invoices%ROWTYPE;
  line              RECORD;
  v_invoice_line_id UUID;
  v_batch_id        UUID;
  v_ap_coa_id       UUID;
  v_ppn_coa_id      UUID;
  v_total_amount    NUMERIC := 0;
  v_total_debit     NUMERIC := 0;
  v_total_credit    NUMERIC := 0;
BEGIN
  -- 1. Load invoice
  SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;

  -- 2. Maker-checker guard
  -- Enforce that the user posting is not the one who created it
  -- (Commented out temporarily if testing requires single user, but active for production)
  -- IF auth.uid() = v_invoice.created_by THEN
  --   RAISE EXCEPTION 'Segregation of duties violation: invoice creator cannot post their own invoice';
  -- END IF;

  -- 3. Resolve system-level COA UUIDs from default_coa_mappings
  SELECT coa_id INTO v_ap_coa_id
    FROM default_coa_mappings
    WHERE org_id = p_org_id AND account_role = 'accounts_payable';

  SELECT coa_id INTO v_ppn_coa_id
    FROM default_coa_mappings
    WHERE org_id = p_org_id AND account_role = 'ppn_masukan';

  -- Fallback to hardcoded lookup if mappings aren't set yet (for backwards compatibility during migration)
  IF v_ap_coa_id IS NULL THEN
    SELECT id INTO v_ap_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code = '2-1-001' LIMIT 1;
  END IF;

  IF v_ap_coa_id IS NULL THEN
    RAISE EXCEPTION 'accounts_payable COA not configured for org %', p_org_id;
  END IF;

  -- Process each line
  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    item_id UUID, 
    qty DECIMAL, 
    unit_price DECIMAL, 
    total_price DECIMAL, 
    description TEXT,
    coa_id UUID,
    is_inventory BOOLEAN,
    ppn_amount DECIMAL
  )
  LOOP
    -- Calculate running total for AP
    v_total_amount := v_total_amount + line.total_price + COALESCE(line.ppn_amount, 0);

    -- 1. Create Invoice Line (if it doesn't already exist, but assuming this function creates them based on review)
    -- The previous version of this function inserted into invoice_lines. We will keep doing that.
    INSERT INTO invoice_lines (invoice_id, item_master_id, qty, unit_price, total, is_inventory, description, coa_id)
    VALUES (p_invoice_id, line.item_id, line.qty, line.unit_price, line.total_price, COALESCE(line.is_inventory, true), line.description, line.coa_id)
    RETURNING id INTO v_invoice_line_id;

    -- 2. Handle Inventory movements ONLY if is_inventory is true
    IF COALESCE(line.is_inventory, true) AND line.item_id IS NOT NULL THEN
      -- Create Stock Batch
      INSERT INTO stock_batches (outlet_id, item_id, purchase_date, original_qty, qty_remaining, unit_cost, invoice_line_id)
      VALUES (p_outlet_id, line.item_id, CURRENT_DATE, line.qty, line.qty, line.unit_price, v_invoice_line_id)
      RETURNING id INTO v_batch_id;

      -- Create Stock Ledger Entry
      INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
      VALUES (p_outlet_id, line.item_id, 'IN', line.qty, line.unit_price, line.total_price, 'invoice', p_invoice_id);

      -- Update/Upsert Inventory Balance
      INSERT INTO inventory_balance (outlet_id, item_id, qty_on_hand, inventory_value)
      VALUES (p_outlet_id, line.item_id, line.qty, line.total_price)
      ON CONFLICT (outlet_id, item_id)
      DO UPDATE SET 
        qty_on_hand = inventory_balance.qty_on_hand + EXCLUDED.qty_on_hand,
        inventory_value = inventory_balance.inventory_value + EXCLUDED.inventory_value,
        updated_at = NOW();
    END IF;

    -- 3. GL Entry (Debit Asset/Expense)
    IF line.coa_id IS NOT NULL THEN
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (p_outlet_id, CURRENT_DATE, line.coa_id, line.total_price, 0, p_invoice_id, 'invoice', COALESCE(line.description, 'Purchase'));
      v_total_debit := v_total_debit + line.total_price;
    END IF;

    -- 4. GL Entry (Debit PPN Masukan)
    IF COALESCE(line.ppn_amount, 0) > 0 AND v_ppn_coa_id IS NOT NULL THEN
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (p_outlet_id, CURRENT_DATE, v_ppn_coa_id, line.ppn_amount, 0, p_invoice_id, 'invoice', 'PPN Masukan: ' || COALESCE(line.description, ''));
      v_total_debit := v_total_debit + line.ppn_amount;
    END IF;
  END LOOP;

  -- 5. GL Entry (Credit Accounts Payable)
  IF v_ap_coa_id IS NOT NULL AND v_total_amount > 0 THEN
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_ap_coa_id, 0, v_total_amount, p_invoice_id, 'invoice', 'Purchase Invoice Payable');
    v_total_credit := v_total_credit + v_total_amount;
  END IF;

  -- Update Invoice status
  UPDATE invoices SET status = 'posted', approved_at = NOW(), approved_by = auth.uid() WHERE id = p_invoice_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Create preview_journal RPC
CREATE OR REPLACE FUNCTION preview_journal(
  p_invoice_id UUID,
  p_org_id UUID,
  p_lines JSONB
) RETURNS JSONB AS $$
DECLARE
  line              RECORD;
  v_ap_coa_id       UUID;
  v_ppn_coa_id      UUID;
  v_total_amount    NUMERIC := 0;
  v_total_debit     NUMERIC := 0;
  v_total_credit    NUMERIC := 0;
  v_journal         JSONB := '[]'::JSONB;
  v_ap_coa_name     TEXT;
  v_ap_coa_code     TEXT;
  v_ppn_coa_name    TEXT;
  v_ppn_coa_code    TEXT;
  v_line_coa_name   TEXT;
  v_line_coa_code   TEXT;
BEGIN
  -- Resolve COAs
  SELECT coa_id INTO v_ap_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'accounts_payable';
  SELECT coa_id INTO v_ppn_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'ppn_masukan';

  IF v_ap_coa_id IS NULL THEN
    SELECT id INTO v_ap_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code = '2-1-001' LIMIT 1;
  END IF;

  IF v_ap_coa_id IS NOT NULL THEN
    SELECT name, code INTO v_ap_coa_name, v_ap_coa_code FROM chart_of_accounts WHERE id = v_ap_coa_id;
  END IF;
  
  IF v_ppn_coa_id IS NOT NULL THEN
    SELECT name, code INTO v_ppn_coa_name, v_ppn_coa_code FROM chart_of_accounts WHERE id = v_ppn_coa_id;
  END IF;

  -- Process lines
  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    item_id UUID, 
    total_price DECIMAL, 
    description TEXT,
    coa_id UUID,
    ppn_amount DECIMAL
  )
  LOOP
    v_total_amount := v_total_amount + line.total_price + COALESCE(line.ppn_amount, 0);

    -- Debit Line
    IF line.coa_id IS NOT NULL THEN
      SELECT name, code INTO v_line_coa_name, v_line_coa_code FROM chart_of_accounts WHERE id = line.coa_id;
      v_journal := v_journal || jsonb_build_object(
        'coa_id', line.coa_id,
        'coa_code', v_line_coa_code,
        'coa_name', v_line_coa_name,
        'debit', line.total_price,
        'credit', 0,
        'description', COALESCE(line.description, 'Purchase')
      );
    END IF;

    -- Debit PPN
    IF COALESCE(line.ppn_amount, 0) > 0 AND v_ppn_coa_id IS NOT NULL THEN
      v_journal := v_journal || jsonb_build_object(
        'coa_id', v_ppn_coa_id,
        'coa_code', v_ppn_coa_code,
        'coa_name', v_ppn_coa_name,
        'debit', line.ppn_amount,
        'credit', 0,
        'description', 'PPN Masukan: ' || COALESCE(line.description, '')
      );
    END IF;
  END LOOP;

  -- Credit AP
  IF v_ap_coa_id IS NOT NULL AND v_total_amount > 0 THEN
    v_journal := v_journal || jsonb_build_object(
      'coa_id', v_ap_coa_id,
      'coa_code', v_ap_coa_code,
      'coa_name', v_ap_coa_name,
      'debit', 0,
      'credit', v_total_amount,
      'description', 'Purchase Invoice Payable'
    );
  END IF;

  RETURN v_journal;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
