-- Fix POS Checkout to dynamically deduct raw materials via BOM (Bill of Materials) if applicable.

CREATE OR REPLACE FUNCTION process_pos_order(
  p_org_id UUID,
  p_outlet_id UUID,
  p_cashier_id UUID,
  p_payment_method TEXT,
  p_subtotal NUMERIC,
  p_tax_amount NUMERIC,
  p_total_amount NUMERIC,
  p_lines JSONB
) RETURNS UUID AS $$
DECLARE
  v_order_id UUID;
  line RECORD;
  bom_rec RECORD;
  v_revenue_coa_id UUID;
  v_cogs_coa_id UUID;
  v_inventory_coa_id UUID;
  v_payment_coa_id UUID;
  v_avg_cost NUMERIC := 0;
  v_total_cogs NUMERIC := 0;
  v_line_cogs NUMERIC := 0;
  v_has_bom BOOLEAN := FALSE;
BEGIN
  -- Insert order
  INSERT INTO pos_orders (org_id, outlet_id, cashier_id, status, subtotal, tax_amount, total_amount, payment_method)
  VALUES (p_org_id, p_outlet_id, p_cashier_id, 'completed', p_subtotal, p_tax_amount, p_total_amount, p_payment_method)
  RETURNING id INTO v_order_id;

  -- Resolve Payment COA
  SELECT coa_id INTO v_payment_coa_id FROM pos_payment_method_mapping 
  WHERE org_id = p_org_id AND payment_method = p_payment_method AND (outlet_id = p_outlet_id OR outlet_id IS NULL)
  ORDER BY outlet_id NULLS LAST LIMIT 1;

  IF v_payment_coa_id IS NULL THEN
    SELECT id INTO v_payment_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code LIKE '1-1%' AND is_header = false LIMIT 1;
  END IF;

  -- Resolve Revenue COA (using 'finished' category)
  SELECT revenue_coa_id, cogs_coa_id INTO v_revenue_coa_id, v_cogs_coa_id FROM pos_coa_mapping 
  WHERE org_id = p_org_id AND pos_category = 'finished' AND (outlet_id = p_outlet_id OR outlet_id IS NULL)
  ORDER BY outlet_id NULLS LAST LIMIT 1;

  IF v_revenue_coa_id IS NULL THEN
    SELECT id INTO v_revenue_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code LIKE '4-%' AND is_header = false LIMIT 1;
  END IF;
  IF v_cogs_coa_id IS NULL THEN
    SELECT id INTO v_cogs_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code LIKE '5-%' AND is_header = false LIMIT 1;
  END IF;
  
  -- Resolve Inventory COA (global fallback for simplicity)
  SELECT id INTO v_inventory_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code LIKE '1-3%' AND is_header = false LIMIT 1;

  -- Process Lines
  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    item_id UUID, 
    qty NUMERIC, 
    unit_price NUMERIC, 
    subtotal NUMERIC
  )
  LOOP
    -- Insert line
    INSERT INTO pos_order_lines (order_id, item_id, qty, unit_price, subtotal)
    VALUES (v_order_id, line.item_id, line.qty, line.unit_price, line.subtotal);

    v_line_cogs := 0;
    v_has_bom := FALSE;

    -- Check if item has a BOM (Recipe)
    FOR bom_rec IN SELECT * FROM bom WHERE output_item_id = line.item_id
    LOOP
      v_has_bom := TRUE;
      
      -- Calculate cost for this ingredient
      SELECT CASE WHEN qty_on_hand > 0 THEN inventory_value / qty_on_hand ELSE 0 END INTO v_avg_cost 
      FROM inventory_balance WHERE outlet_id = p_outlet_id AND item_id = bom_rec.input_item_id;
      
      v_avg_cost := COALESCE(v_avg_cost, 0);
      
      -- Add to line COGS
      v_line_cogs := v_line_cogs + (v_avg_cost * bom_rec.qty_per_unit * line.qty);

      -- Deduct ingredient from Stock Ledger
      INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id, notes)
      VALUES (p_outlet_id, bom_rec.input_item_id, 'OUT', (bom_rec.qty_per_unit * line.qty), v_avg_cost, v_avg_cost * (bom_rec.qty_per_unit * line.qty), 'pos_order', v_order_id, 'POS Sale (Recipe Deduction)');

      -- Deduct ingredient from Inventory Balance
      INSERT INTO inventory_balance (outlet_id, item_id, qty_on_hand, inventory_value)
      VALUES (p_outlet_id, bom_rec.input_item_id, -(bom_rec.qty_per_unit * line.qty), -(v_avg_cost * bom_rec.qty_per_unit * line.qty))
      ON CONFLICT (outlet_id, item_id)
      DO UPDATE SET 
        qty_on_hand = inventory_balance.qty_on_hand + EXCLUDED.qty_on_hand,
        inventory_value = inventory_balance.inventory_value + EXCLUDED.inventory_value,
        updated_at = NOW();
    END LOOP;

    -- If no BOM found, deduct the item directly (e.g. canned drinks)
    IF NOT v_has_bom THEN
      SELECT CASE WHEN qty_on_hand > 0 THEN inventory_value / qty_on_hand ELSE 0 END INTO v_avg_cost 
      FROM inventory_balance WHERE outlet_id = p_outlet_id AND item_id = line.item_id;
      
      v_avg_cost := COALESCE(v_avg_cost, 0);
      v_line_cogs := v_avg_cost * line.qty;

      INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id, notes)
      VALUES (p_outlet_id, line.item_id, 'OUT', line.qty, v_avg_cost, v_line_cogs, 'pos_order', v_order_id, 'POS Sale');

      INSERT INTO inventory_balance (outlet_id, item_id, qty_on_hand, inventory_value)
      VALUES (p_outlet_id, line.item_id, -line.qty, -v_line_cogs)
      ON CONFLICT (outlet_id, item_id)
      DO UPDATE SET 
        qty_on_hand = inventory_balance.qty_on_hand + EXCLUDED.qty_on_hand,
        inventory_value = inventory_balance.inventory_value + EXCLUDED.inventory_value,
        updated_at = NOW();
    END IF;

    -- Add line COGS to total COGS
    v_total_cogs := v_total_cogs + v_line_cogs;
  END LOOP;

  -- GL Entries
  -- 1. Debit Cash/Payment
  IF v_payment_coa_id IS NOT NULL THEN
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_payment_coa_id, p_total_amount, 0, v_order_id, 'pos_order', 'POS Sale Payment');
  END IF;

  -- 2. Credit Revenue
  IF v_revenue_coa_id IS NOT NULL THEN
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_revenue_coa_id, 0, p_subtotal, v_order_id, 'pos_order', 'POS Sale Revenue');
  END IF;

  -- 3. Credit Tax Liability (if any)
  IF p_tax_amount > 0 THEN
    DECLARE v_tax_coa_id UUID;
    BEGIN
      SELECT id INTO v_tax_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND name ILIKE '%tax%' OR name ILIKE '%ppn%' AND type='liability' LIMIT 1;
      IF v_tax_coa_id IS NOT NULL THEN
        INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
        VALUES (p_outlet_id, CURRENT_DATE, v_tax_coa_id, 0, p_tax_amount, v_order_id, 'pos_order', 'POS Tax Collected');
      END IF;
    END;
  END IF;

  -- 4. COGS & Inventory entries (if tracked)
  IF v_cogs_coa_id IS NOT NULL AND v_inventory_coa_id IS NOT NULL AND v_total_cogs > 0 THEN
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_cogs_coa_id, v_total_cogs, 0, v_order_id, 'pos_order', 'POS COGS');
    
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_inventory_coa_id, 0, v_total_cogs, v_order_id, 'pos_order', 'POS Inventory Deduction');
  END IF;

  RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
