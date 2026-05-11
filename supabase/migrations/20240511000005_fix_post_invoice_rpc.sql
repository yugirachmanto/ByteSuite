-- Drop ALL overloaded versions of post_invoice to avoid conflicts
DROP FUNCTION IF EXISTS post_invoice(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS post_invoice(UUID, UUID, UUID, JSONB, UUID);

-- Re-create the correct version
CREATE OR REPLACE FUNCTION post_invoice(
  p_invoice_id UUID,
  p_outlet_id UUID,
  p_org_id UUID,
  p_lines JSONB,
  p_credit_coa_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  line              RECORD;
  v_invoice_line_id UUID;
  v_batch_id        UUID;
  v_ap_coa_id       UUID;
  v_credit_coa_type TEXT;
  v_total_amount    NUMERIC := 0;
BEGIN
  -- Resolve credit COA
  IF p_credit_coa_id IS NOT NULL THEN
    v_ap_coa_id := p_credit_coa_id;
  ELSE
    SELECT coa_id INTO v_ap_coa_id
      FROM default_coa_mappings
      WHERE org_id = p_org_id AND account_role = 'accounts_payable';
    
    IF v_ap_coa_id IS NULL THEN
      SELECT id INTO v_ap_coa_id FROM chart_of_accounts 
      WHERE org_id = p_org_id AND code = '2-1-001' LIMIT 1;
    END IF;
  END IF;

  IF v_ap_coa_id IS NULL THEN
    RAISE EXCEPTION 'Closing COA (credit account) not found or configured';
  END IF;

  -- Check the TYPE of the closing account to determine payment status
  SELECT type INTO v_credit_coa_type FROM chart_of_accounts WHERE id = v_ap_coa_id;

  -- Process each line
  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    item_id UUID, 
    qty DECIMAL, 
    unit_price DECIMAL, 
    total_price DECIMAL, 
    description TEXT,
    coa_id UUID,
    is_inventory BOOLEAN
  )
  LOOP
    v_total_amount := v_total_amount + line.total_price;

    -- 1. Create Invoice Line (column is "total", value is line.total_price)
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

    -- 3. GL Entry (Debit)
    IF line.coa_id IS NOT NULL THEN
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (p_outlet_id, CURRENT_DATE, line.coa_id, line.total_price, 0, p_invoice_id, 'invoice', COALESCE(line.description, 'Purchase'));
    END IF;
  END LOOP;

  -- 4. GL Entry (Credit Closing)
  IF v_ap_coa_id IS NOT NULL AND v_total_amount > 0 THEN
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_ap_coa_id, 0, v_total_amount, p_invoice_id, 'invoice', 'Purchase Invoice Closing Entry');
  END IF;

  -- 5. Update invoice status
  -- If closing account is an ASSET (cash/bank) = paid immediately
  -- If closing account is a LIABILITY (hutang) = unpaid, goes to AP
  IF v_credit_coa_type = 'asset' THEN
    UPDATE invoices SET status = 'posted', approved_at = NOW(), approved_by = auth.uid(),
      payment_status = 'paid', paid_amount = v_total_amount
    WHERE id = p_invoice_id;
  ELSE
    UPDATE invoices SET status = 'posted', approved_at = NOW(), approved_by = auth.uid(),
      payment_status = 'unpaid', paid_amount = 0
    WHERE id = p_invoice_id;
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
