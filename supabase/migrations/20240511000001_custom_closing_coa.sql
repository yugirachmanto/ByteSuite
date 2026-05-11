-- Update post_invoice to accept custom credit account
CREATE OR REPLACE FUNCTION post_invoice(
  p_invoice_id UUID,
  p_outlet_id UUID,
  p_org_id UUID,
  p_lines JSONB,
  p_credit_coa_id UUID DEFAULT NULL
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

  -- 2. Resolve system-level COA UUIDs
  -- If p_credit_coa_id is provided, use it. Otherwise use default mapping.
  IF p_credit_coa_id IS NOT NULL THEN
    v_ap_coa_id := p_credit_coa_id;
  ELSE
    SELECT coa_id INTO v_ap_coa_id
      FROM default_coa_mappings
      WHERE org_id = p_org_id AND account_role = 'accounts_payable';
    
    -- Fallback
    IF v_ap_coa_id IS NULL THEN
      SELECT id INTO v_ap_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code = '2-1-001' LIMIT 1;
    END IF;
  END IF;

  SELECT coa_id INTO v_ppn_coa_id
    FROM default_coa_mappings
    WHERE org_id = p_org_id AND account_role = 'ppn_masukan';

  IF v_ap_coa_id IS NULL THEN
    RAISE EXCEPTION 'Closing COA (credit account) not found or configured';
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
    v_total_amount := v_total_amount + line.total_price + COALESCE(line.ppn_amount, 0);

    -- 1. Create Invoice Line
    INSERT INTO invoice_lines (invoice_id, item_master_id, qty, unit_price, total, is_inventory, description, coa_id)
    VALUES (p_invoice_id, line.item_id, line.qty, line.unit_price, line.total_price, COALESCE(line.is_inventory, true), line.description, line.coa_id)
    RETURNING id INTO v_invoice_line_id;

    -- 2. Handle Inventory
    IF COALESCE(line.is_inventory, true) AND line.item_id IS NOT NULL THEN
      INSERT INTO stock_batches (outlet_id, item_id, purchase_date, original_qty, qty_remaining, unit_cost, invoice_line_id)
      VALUES (p_outlet_id, line.item_id, CURRENT_DATE, line.qty, line.qty, line.unit_price, v_invoice_line_id)
      RETURNING id INTO v_batch_id;

      INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
      VALUES (p_outlet_id, line.item_id, 'IN', line.qty, line.unit_price, line.total_price, 'invoice', p_invoice_id);

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
    END IF;

    -- 4. GL Entry (Debit PPN Masukan)
    IF COALESCE(line.ppn_amount, 0) > 0 AND v_ppn_coa_id IS NOT NULL THEN
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (p_outlet_id, CURRENT_DATE, v_ppn_coa_id, line.ppn_amount, 0, p_invoice_id, 'invoice', 'PPN Masukan: ' || COALESCE(line.description, ''));
    END IF;
  END LOOP;

  -- 5. GL Entry (Credit Closing Account)
  IF v_ap_coa_id IS NOT NULL AND v_total_amount > 0 THEN
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_ap_coa_id, 0, v_total_amount, p_invoice_id, 'invoice', 'Purchase Invoice Closing Entry');
  END IF;

  -- Update Invoice status
  -- If p_credit_coa_id is provided AND it's different from the default AP mapping, 
  -- we assume it's an immediate payment (e.g. Kas/Bank).
  IF p_credit_coa_id IS NOT NULL THEN
    UPDATE invoices 
    SET 
      status = 'posted', 
      approved_at = NOW(), 
      approved_by = auth.uid(),
      payment_status = 'paid',
      paid_amount = v_total_amount
    WHERE id = p_invoice_id;
  ELSE
    UPDATE invoices 
    SET 
      status = 'posted', 
      approved_at = NOW(), 
      approved_by = auth.uid(),
      payment_status = 'unpaid',
      paid_amount = 0
    WHERE id = p_invoice_id;
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Update preview_journal to accept custom credit account
CREATE OR REPLACE FUNCTION preview_journal(
  p_invoice_id UUID,
  p_org_id UUID,
  p_lines JSONB,
  p_credit_coa_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  line              RECORD;
  v_ap_coa_id       UUID;
  v_ppn_coa_id      UUID;
  v_total_amount    NUMERIC := 0;
  v_journal         JSONB := '[]'::JSONB;
  v_ap_coa_name     TEXT;
  v_ap_coa_code     TEXT;
  v_ppn_coa_name    TEXT;
  v_ppn_coa_code    TEXT;
  v_line_coa_name   TEXT;
  v_line_coa_code   TEXT;
BEGIN
  -- Resolve COAs
  IF p_credit_coa_id IS NOT NULL THEN
    v_ap_coa_id := p_credit_coa_id;
  ELSE
    SELECT coa_id INTO v_ap_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'accounts_payable';
    IF v_ap_coa_id IS NULL THEN
      SELECT id INTO v_ap_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code = '2-1-001' LIMIT 1;
    END IF;
  END IF;

  SELECT coa_id INTO v_ppn_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'ppn_masukan';

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

  -- Credit Closing Entry
  IF v_ap_coa_id IS NOT NULL AND v_total_amount > 0 THEN
    v_journal := v_journal || jsonb_build_object(
      'coa_id', v_ap_coa_id,
      'coa_code', v_ap_coa_code,
      'coa_name', v_ap_coa_name,
      'debit', 0,
      'credit', v_total_amount,
      'description', 'Purchase Invoice Closing Entry'
    );
  END IF;

  RETURN v_journal;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
