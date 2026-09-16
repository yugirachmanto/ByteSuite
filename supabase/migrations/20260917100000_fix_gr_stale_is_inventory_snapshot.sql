-- post_goods_receipt trusted a client-supplied `is_inventory` per line,
-- which the PO creation UI copies from item_master.is_inventory once, at
-- PO-creation time, onto po_lines.is_inventory — then the receive page
-- reads that stale snapshot with no UI to see or correct it. If an item's
-- Track as Inventory flag is changed (e.g. via the Items bulk-import
-- preview) after a PO already exists for it but before that PO is
-- received, receiving would silently use the OLD flag: a since-disabled
-- item still gets a stock_batch/inventory_balance row created (or the
-- reverse — a since-enabled item's purchase silently skips stock and goes
-- straight to expense). This makes the flag authoritative at receive time
-- instead, matching the "never trust stale client state" principle used
-- elsewhere for money-relevant fields (e.g. server-recalculated POS prices).
CREATE OR REPLACE FUNCTION post_goods_receipt(
  p_po_id UUID,
  p_outlet_id UUID,
  p_org_id UUID,
  p_receipt_date DATE,
  p_notes TEXT,
  p_lines JSONB
) RETURNS UUID AS $$
DECLARE
  v_gr_id UUID;
  v_gr_ir_coa_id UUID;
  v_gr_line_id UUID;
  v_batch_id UUID;
  line RECORD;
  v_conversion_factor NUMERIC;
  v_converted_qty NUMERIC;
  v_converted_cost NUMERIC;
  v_line_total NUMERIC;
  v_total_amount NUMERIC := 0;
  v_po_line_qty NUMERIC;
  v_po_line_received NUMERIC;
  v_remaining_lines INTEGER;
  v_is_inventory BOOLEAN;
BEGIN
  SELECT coa_id INTO v_gr_ir_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'gr_ir_clearing';
  IF v_gr_ir_coa_id IS NULL THEN
    RAISE EXCEPTION 'GR/IR Clearing account is not configured in Settings > Accounting.';
  END IF;

  INSERT INTO goods_receipts (outlet_id, po_id, receipt_date, status, notes, received_by)
  VALUES (p_outlet_id, p_po_id, COALESCE(p_receipt_date, CURRENT_DATE), 'posted', p_notes, auth.uid())
  RETURNING id INTO v_gr_id;

  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    po_line_id UUID, item_id UUID, qty_received DECIMAL, unit_cost DECIMAL, coa_id UUID, is_inventory BOOLEAN, notes TEXT
  )
  LOOP
    SELECT qty, received_qty INTO v_po_line_qty, v_po_line_received FROM po_lines WHERE id = line.po_line_id FOR UPDATE;
    IF v_po_line_qty IS NULL THEN
      RAISE EXCEPTION 'PO line % not found', line.po_line_id;
    END IF;
    IF line.qty_received > (v_po_line_qty - v_po_line_received + 0.0001) THEN
      RAISE EXCEPTION 'Cannot receive %: only % remaining on this PO line', line.qty_received, (v_po_line_qty - v_po_line_received);
    END IF;

    v_line_total := line.qty_received * line.unit_cost;
    v_total_amount := v_total_amount + v_line_total;

    INSERT INTO gr_lines (gr_id, po_line_id, item_id, qty_received, unit_cost, notes)
    VALUES (v_gr_id, line.po_line_id, line.item_id, line.qty_received, line.unit_cost, line.notes)
    RETURNING id INTO v_gr_line_id;

    -- Authoritative, current flag — never the client-supplied snapshot.
    SELECT is_inventory INTO v_is_inventory FROM item_master WHERE id = line.item_id;

    IF COALESCE(v_is_inventory, true) THEN
      SELECT COALESCE(conversion_factor, 1) INTO v_conversion_factor FROM item_master WHERE id = line.item_id;
      IF v_conversion_factor <= 0 THEN v_conversion_factor := 1; END IF;

      v_converted_qty := line.qty_received * v_conversion_factor;
      v_converted_cost := line.unit_cost / v_conversion_factor;

      INSERT INTO stock_batches (outlet_id, item_id, purchase_date, original_qty, qty_remaining, unit_cost, gr_line_id)
      VALUES (p_outlet_id, line.item_id, COALESCE(p_receipt_date, CURRENT_DATE), v_converted_qty, v_converted_qty, v_converted_cost, v_gr_line_id)
      RETURNING id INTO v_batch_id;

      INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
      VALUES (p_outlet_id, line.item_id, 'IN', v_converted_qty, v_converted_cost, v_line_total, 'goods_receipt', v_gr_id);

      INSERT INTO inventory_balance (outlet_id, item_id, qty_on_hand, inventory_value)
      VALUES (p_outlet_id, line.item_id, v_converted_qty, v_line_total)
      ON CONFLICT (outlet_id, item_id)
      DO UPDATE SET
        qty_on_hand = inventory_balance.qty_on_hand + EXCLUDED.qty_on_hand,
        inventory_value = inventory_balance.inventory_value + EXCLUDED.inventory_value,
        updated_at = NOW();
    END IF;

    IF line.coa_id IS NULL THEN
      RAISE EXCEPTION 'COA mapping missing for received line (item %)', line.item_id;
    END IF;

    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, COALESCE(p_receipt_date, CURRENT_DATE), line.coa_id, v_line_total, 0, v_gr_id, 'goods_receipt', 'Goods Receipt');

    UPDATE po_lines SET received_qty = received_qty + line.qty_received WHERE id = line.po_line_id;
  END LOOP;

  INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
  VALUES (p_outlet_id, COALESCE(p_receipt_date, CURRENT_DATE), v_gr_ir_coa_id, 0, v_total_amount, v_gr_id, 'goods_receipt', 'GR/IR Clearing');

  SELECT COUNT(*) INTO v_remaining_lines FROM po_lines WHERE po_id = p_po_id AND received_qty < qty - 0.0001;
  IF v_remaining_lines = 0 THEN
    UPDATE purchase_orders SET status = 'received' WHERE id = p_po_id;
  ELSE
    UPDATE purchase_orders SET status = 'partially_received' WHERE id = p_po_id;
  END IF;

  RETURN v_gr_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
