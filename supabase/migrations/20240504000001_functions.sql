-- SQL Functions for Atomic Transactions

-- 1. Post Invoice (Atomic update of GL, Stock Ledger, and Inventory Balance)
CREATE OR REPLACE FUNCTION post_invoice(
  p_invoice_id UUID,
  p_outlet_id UUID,
  p_org_id UUID,
  p_lines JSONB
) RETURNS VOID AS $$
DECLARE
  line RECORD;
  v_batch_id UUID;
  v_unit_cost DECIMAL;
BEGIN
  -- Update Invoice status
  UPDATE invoices SET status = 'posted', updated_at = NOW() WHERE id = p_invoice_id;

  -- Process each line
  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(item_id UUID, qty DECIMAL, unit_price DECIMAL, total_price DECIMAL)
  LOOP
    -- a. Create Inventory Batch
    INSERT INTO inventory_batches (outlet_id, item_id, qty_received, qty_remaining, unit_cost, expiry_date)
    VALUES (p_outlet_id, line.item_id, line.qty, line.qty, line.unit_price, NOW() + INTERVAL '1 year')
    RETURNING id INTO v_batch_id;

    -- b. Create Stock Ledger Entry
    INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
    VALUES (p_outlet_id, line.item_id, 'IN', line.qty, line.unit_price, line.total_price, 'invoice', p_invoice_id);

    -- c. Update/Upsert Inventory Balance
    INSERT INTO inventory_balance (outlet_id, item_id, qty_on_hand, inventory_value)
    VALUES (p_outlet_id, line.item_id, line.qty, line.total_price)
    ON CONFLICT (outlet_id, item_id)
    DO UPDATE SET 
      qty_on_hand = inventory_balance.qty_on_hand + EXCLUDED.qty_on_hand,
      inventory_value = inventory_balance.inventory_value + EXCLUDED.inventory_value,
      updated_at = NOW();

    -- d. Create GL Record (Debit Inventory)
    INSERT INTO gl_entries (org_id, outlet_id, account_type, debit, credit, description, reference_type, reference_id)
    VALUES (p_org_id, p_outlet_id, 'inventory', line.total_price, 0, 'Inventory Purchase', 'invoice', p_invoice_id);
    
    -- e. Create GL Record (Credit Accounts Payable)
    INSERT INTO gl_entries (org_id, outlet_id, account_type, debit, credit, description, reference_type, reference_id)
    VALUES (p_org_id, p_outlet_id, 'accounts_payable', 0, line.total_price, 'Inventory Purchase', 'invoice', p_invoice_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Post Production (Atomic deduction of raw materials and addition of WIP)
CREATE OR REPLACE FUNCTION post_production(
  p_outlet_id UUID,
  p_wip_item_id UUID,
  p_qty_produced DECIMAL,
  p_production_date DATE,
  p_notes TEXT
) RETURNS VOID AS $$
DECLARE
  bom_line RECORD;
  v_total_cost DECIMAL := 0;
  v_line_cost DECIMAL;
  v_log_id UUID;
BEGIN
  -- a. Create Production Log
  INSERT INTO production_log (outlet_id, wip_item_id, qty_produced, production_date, notes)
  VALUES (p_outlet_id, p_wip_item_id, p_qty_produced, p_production_date, p_notes)
  RETURNING id INTO v_log_id;

  -- b. Deduct Raw Materials based on BOM
  FOR bom_line IN SELECT * FROM bom WHERE output_item_id = p_wip_item_id
  LOOP
    -- Calculate cost using FIFO logic (simulated here for brevity, in real app we'd call a FIFO deduction helper)
    -- For now, we take average cost from balance
    SELECT (inventory_value / qty_on_hand) * (bom_line.qty_per_unit * p_qty_produced)
    INTO v_line_cost
    FROM inventory_balance
    WHERE outlet_id = p_outlet_id AND item_id = bom_line.input_item_id;

    v_total_cost := v_total_cost + v_line_cost;

    -- Update balance (Deduct)
    UPDATE inventory_balance
    SET qty_on_hand = qty_on_hand - (bom_line.qty_per_unit * p_qty_produced),
        inventory_value = inventory_value - v_line_cost,
        updated_at = NOW()
    WHERE outlet_id = p_outlet_id AND item_id = bom_line.input_item_id;

    -- Stock Ledger (OUT)
    INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
    VALUES (p_outlet_id, bom_line.input_item_id, 'PRODUCTION_OUT', -(bom_line.qty_per_unit * p_qty_produced), v_line_cost / (bom_line.qty_per_unit * p_qty_produced), v_line_cost, 'production', v_log_id);
  END LOOP;

  -- c. Add WIP to Inventory
  INSERT INTO inventory_balance (outlet_id, item_id, qty_on_hand, inventory_value)
  VALUES (p_outlet_id, p_wip_item_id, p_qty_produced, v_total_cost)
  ON CONFLICT (outlet_id, item_id)
  DO UPDATE SET 
    qty_on_hand = inventory_balance.qty_on_hand + EXCLUDED.qty_on_hand,
    inventory_value = inventory_balance.inventory_value + EXCLUDED.inventory_value,
    updated_at = NOW();

  -- Stock Ledger (IN)
  INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
  VALUES (p_outlet_id, p_wip_item_id, 'PRODUCTION_IN', p_qty_produced, v_total_cost / p_qty_produced, v_total_cost, 'production', v_log_id);

  -- Update log with calculated cost
  UPDATE production_log SET unit_cost = v_total_cost / p_qty_produced WHERE id = v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
