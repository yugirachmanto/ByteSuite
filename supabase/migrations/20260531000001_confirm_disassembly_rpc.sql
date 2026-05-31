CREATE OR REPLACE FUNCTION confirm_disassembly(
  p_log_id UUID,
  p_outlet_id UUID,
  p_components JSONB -- array of { item_id: UUID, qty_actual: DECIMAL, is_waste: BOOLEAN }
) RETURNS VOID AS $$
DECLARE
  v_log disassembly_logs%ROWTYPE;
  v_invoice invoices%ROWTYPE;
  v_parent_batch stock_batches%ROWTYPE;
  v_total_cost NUMERIC := 0;
  v_total_non_waste_qty NUMERIC := 0;
  v_comp RECORD;
  v_allocated_cost NUMERIC;
  v_unit_cost NUMERIC;
BEGIN
  -- 1. Get Log and Invoice
  SELECT * INTO v_log FROM disassembly_logs WHERE id = p_log_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Log not found'; END IF;
  IF v_log.status = 'completed' THEN RAISE EXCEPTION 'Already completed'; END IF;
  
  -- get invoice
  SELECT * INTO v_invoice FROM invoices WHERE id = v_log.invoice_id;

  -- get the batch of the parent item from this invoice
  SELECT * INTO v_parent_batch FROM stock_batches 
  WHERE invoice_line_id IN (SELECT id FROM invoice_lines WHERE invoice_id = v_log.invoice_id AND item_master_id = v_log.parent_item_id)
  LIMIT 1;

  IF v_parent_batch IS NOT NULL THEN
    v_total_cost := v_parent_batch.unit_cost * v_parent_batch.original_qty;
    
    -- OUT parent item from ledger
    INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id, notes)
    VALUES (p_outlet_id, v_log.parent_item_id, 'OUT', v_parent_batch.original_qty, v_parent_batch.unit_cost, v_total_cost, 'invoice_disassembly', p_log_id, 'Disassembly OUT');

    -- Zero out the batch
    UPDATE stock_batches SET qty_remaining = 0 WHERE id = v_parent_batch.id;
    
    -- Update balance
    UPDATE inventory_balance SET 
      qty_on_hand = qty_on_hand - v_parent_batch.original_qty,
      inventory_value = inventory_value - v_total_cost,
      updated_at = NOW()
    WHERE outlet_id = p_outlet_id AND item_id = v_log.parent_item_id;
  END IF;

  -- 2. Calculate total non waste qty
  FOR v_comp IN SELECT * FROM jsonb_to_recordset(p_components) AS x(item_id UUID, qty_actual NUMERIC, is_waste BOOLEAN) LOOP
    IF NOT COALESCE(v_comp.is_waste, FALSE) THEN
      v_total_non_waste_qty := v_total_non_waste_qty + COALESCE(v_comp.qty_actual, 0);
    END IF;
  END LOOP;

  -- 3. Distribute cost and IN child items
  FOR v_comp IN SELECT * FROM jsonb_to_recordset(p_components) AS x(item_id UUID, qty_actual NUMERIC, is_waste BOOLEAN) LOOP
    IF COALESCE(v_comp.is_waste, FALSE) OR v_total_non_waste_qty = 0 THEN
      v_allocated_cost := 0;
    ELSE
      v_allocated_cost := (COALESCE(v_comp.qty_actual, 0) / v_total_non_waste_qty) * v_total_cost;
    END IF;

    -- log items
    INSERT INTO disassembly_log_items (log_id, item_id, qty_actual, cost_allocated)
    VALUES (p_log_id, v_comp.item_id, COALESCE(v_comp.qty_actual, 0), v_allocated_cost);

    IF COALESCE(v_comp.qty_actual, 0) > 0 THEN
      v_unit_cost := CASE WHEN v_comp.qty_actual > 0 THEN v_allocated_cost / v_comp.qty_actual ELSE 0 END;
      
      -- Create batch for child
      INSERT INTO stock_batches (outlet_id, item_id, purchase_date, original_qty, qty_remaining, unit_cost, invoice_line_id)
      VALUES (p_outlet_id, v_comp.item_id, COALESCE(v_invoice.invoice_date, CURRENT_DATE), v_comp.qty_actual, v_comp.qty_actual, 
              v_unit_cost, 
              v_parent_batch.invoice_line_id);

      -- Ledger IN
      INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id, notes)
      VALUES (p_outlet_id, v_comp.item_id, 'IN', v_comp.qty_actual, 
              v_unit_cost, 
              v_allocated_cost, 'invoice_disassembly', p_log_id, 'Disassembly IN');

      -- Balance
      INSERT INTO inventory_balance (outlet_id, item_id, qty_on_hand, inventory_value)
      VALUES (p_outlet_id, v_comp.item_id, v_comp.qty_actual, v_allocated_cost)
      ON CONFLICT (outlet_id, item_id)
      DO UPDATE SET 
        qty_on_hand = inventory_balance.qty_on_hand + EXCLUDED.qty_on_hand,
        inventory_value = inventory_balance.inventory_value + EXCLUDED.inventory_value,
        updated_at = NOW();
    END IF;
  END LOOP;

  -- 4. Mark complete
  UPDATE disassembly_logs SET status = 'completed', performed_at = NOW(), performed_by = auth.uid() WHERE id = p_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
