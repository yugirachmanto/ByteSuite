CREATE OR REPLACE FUNCTION post_invoice(
  p_invoice_id UUID,
  p_outlet_id UUID,
  p_org_id UUID,
  p_lines JSONB
) RETURNS VOID AS $$
DECLARE
  line RECORD;
  v_invoice_line_id UUID;
  v_batch_id UUID;
  v_item_coa_id UUID;
  v_ap_coa_id UUID;
  v_total_amount NUMERIC := 0;
BEGIN
  -- 0. Get Accounts Payable COA for this org
  SELECT id INTO v_ap_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code = '2-1-001' LIMIT 1;

  -- Update Invoice status
  UPDATE invoices SET status = 'posted', updated_at = NOW() WHERE id = p_invoice_id;

  -- Process each line
  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(item_id UUID, qty DECIMAL, unit_price DECIMAL, total_price DECIMAL, description TEXT)
  LOOP
    -- Get item's default COA
    SELECT default_coa_id INTO v_item_coa_id FROM item_master WHERE id = line.item_id;
    -- Fallback to 'Persediaan Bahan Baku' if not set
    IF v_item_coa_id IS NULL THEN
      SELECT id INTO v_item_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code = '1-1-004' LIMIT 1;
    END IF;

    -- 1. Create Invoice Line
    INSERT INTO invoice_lines (invoice_id, item_master_id, qty, unit_price, total, is_inventory, description, coa_id)
    VALUES (p_invoice_id, line.item_id, line.qty, line.unit_price, line.total_price, true, COALESCE(line.description, 'Imported Line'), v_item_coa_id)
    RETURNING id INTO v_invoice_line_id;

    -- 2. Create Stock Batch
    INSERT INTO stock_batches (outlet_id, item_id, purchase_date, original_qty, qty_remaining, unit_cost, invoice_line_id)
    VALUES (p_outlet_id, line.item_id, CURRENT_DATE, line.qty, line.qty, line.unit_price, v_invoice_line_id)
    RETURNING id INTO v_batch_id;

    -- 3. Create Stock Ledger Entry
    INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
    VALUES (p_outlet_id, line.item_id, 'IN', line.qty, line.unit_price, line.total_price, 'invoice', p_invoice_id);

    -- 4. Update/Upsert Inventory Balance
    INSERT INTO inventory_balance (outlet_id, item_id, qty_on_hand, inventory_value)
    VALUES (p_outlet_id, line.item_id, line.qty, line.total_price)
    ON CONFLICT (outlet_id, item_id)
    DO UPDATE SET 
      qty_on_hand = inventory_balance.qty_on_hand + EXCLUDED.qty_on_hand,
      inventory_value = inventory_balance.inventory_value + EXCLUDED.inventory_value,
      updated_at = NOW();

    -- 5. Create GL Entry (Debit Inventory/Asset)
    IF v_item_coa_id IS NOT NULL THEN
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (p_outlet_id, CURRENT_DATE, v_item_coa_id, line.total_price, 0, p_invoice_id, 'invoice', 'Inventory Purchase: ' || line.description);
    END IF;

    v_total_amount := v_total_amount + line.total_price;
  END LOOP;

  -- 6. Create GL Entry (Credit Accounts Payable)
  IF v_ap_coa_id IS NOT NULL AND v_total_amount > 0 THEN
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_ap_coa_id, 0, v_total_amount, p_invoice_id, 'invoice', 'Purchase Invoice Payable');
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
