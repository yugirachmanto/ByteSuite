-- Fix post_vendor_return: quantities entered on the return form are in
-- Purchase Unit (matching PR/PO/GR, per clarification that purchasing scope
-- always uses Purchase Unit, never Storage Unit), but stock_batches.qty_remaining
-- is stored in Storage Unit (post_goods_receipt already converts via
-- item_master.conversion_factor before writing batches). The original
-- post_vendor_return compared/decremented the Storage Unit batch using the
-- raw Purchase Unit return quantity with no conversion — correct only by
-- coincidence for conversion_factor = 1 items (which is all that was
-- tested), silently wrong for anything bought in one unit and stored in
-- another (e.g. purchased by KG, stocked by gram).
--
-- gr_lines.qty_received/unit_cost and po_lines.qty/received_qty/returned_qty
-- all stay in Purchase Unit throughout (this was already consistent and is
-- unchanged) — only the stock_batches/stock_ledger/inventory_balance side,
-- which is Storage Unit, needed the same conversion_factor treatment
-- post_goods_receipt already applies.

CREATE OR REPLACE FUNCTION post_vendor_return(
  p_gr_id UUID,
  p_outlet_id UUID,
  p_org_id UUID,
  p_return_date DATE,
  p_reason TEXT,
  p_lines JSONB
) RETURNS UUID AS $$
DECLARE
  v_return_id UUID;
  v_gr_ir_coa_id UUID;
  line RECORD;
  v_batch RECORD;
  v_conversion_factor NUMERIC;
  v_converted_qty_returned NUMERIC;
  v_line_total NUMERIC;
  v_total_amount NUMERIC := 0;
BEGIN
  SELECT coa_id INTO v_gr_ir_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'gr_ir_clearing';
  IF v_gr_ir_coa_id IS NULL THEN
    RAISE EXCEPTION 'GR/IR Clearing account is not configured in Settings > Accounting.';
  END IF;

  INSERT INTO vendor_returns (outlet_id, gr_id, return_date, status, reason, created_by)
  VALUES (p_outlet_id, p_gr_id, COALESCE(p_return_date, CURRENT_DATE), 'posted', p_reason, auth.uid())
  RETURNING id INTO v_return_id;

  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    gr_line_id UUID, item_id UUID, qty_returned DECIMAL, coa_id UUID
  )
  LOOP
    SELECT * INTO v_batch FROM stock_batches WHERE gr_line_id = line.gr_line_id FOR UPDATE;
    IF v_batch.id IS NULL THEN
      RAISE EXCEPTION 'No stock batch found for GR line %', line.gr_line_id;
    END IF;

    SELECT COALESCE(conversion_factor, 1) INTO v_conversion_factor FROM item_master WHERE id = line.item_id;
    IF v_conversion_factor <= 0 THEN v_conversion_factor := 1; END IF;

    -- qty_returned arrives in Purchase Unit; stock_batches is Storage Unit.
    v_converted_qty_returned := line.qty_returned * v_conversion_factor;

    IF v_batch.qty_remaining < v_converted_qty_returned - 0.0001 THEN
      RAISE EXCEPTION 'Cannot return %: only % remaining in stock from this receipt (some may already be consumed)', line.qty_returned, v_batch.qty_remaining / v_conversion_factor;
    END IF;

    UPDATE stock_batches SET qty_remaining = qty_remaining - v_converted_qty_returned WHERE id = v_batch.id;

    -- return_lines.qty_returned stays in Purchase Unit, matching gr_lines/po_lines.
    INSERT INTO return_lines (return_id, gr_line_id, item_id, qty_returned, unit_cost)
    VALUES (v_return_id, line.gr_line_id, line.item_id, line.qty_returned, v_batch.unit_cost * v_conversion_factor);

    -- v_batch.unit_cost is per Storage Unit; multiply by the converted
    -- (Storage Unit) quantity for a correct monetary total either way.
    v_line_total := v_converted_qty_returned * v_batch.unit_cost;

    INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
    VALUES (p_outlet_id, line.item_id, 'OUT', v_converted_qty_returned, v_batch.unit_cost, v_line_total, 'vendor_return', v_return_id);

    UPDATE inventory_balance
    SET qty_on_hand = qty_on_hand - v_converted_qty_returned,
        inventory_value = inventory_value - v_line_total,
        updated_at = NOW()
    WHERE outlet_id = p_outlet_id AND item_id = line.item_id;

    IF line.coa_id IS NULL THEN
      RAISE EXCEPTION 'COA mapping missing for returned line (item %)', line.item_id;
    END IF;

    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, COALESCE(p_return_date, CURRENT_DATE), line.coa_id, 0, v_line_total, v_return_id, 'vendor_return', 'Vendor Return');

    v_total_amount := v_total_amount + v_line_total;

    -- po_lines.returned_qty stays in Purchase Unit, unconverted.
    UPDATE po_lines pl SET returned_qty = returned_qty + line.qty_returned
    FROM gr_lines gl WHERE gl.id = line.gr_line_id AND pl.id = gl.po_line_id;
  END LOOP;

  INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
  VALUES (p_outlet_id, COALESCE(p_return_date, CURRENT_DATE), v_gr_ir_coa_id, v_total_amount, 0, v_return_id, 'vendor_return', 'GR/IR Clearing Reversal (Return)');

  RETURN v_return_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
