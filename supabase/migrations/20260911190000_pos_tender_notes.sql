-- POS reporting additions: per-tender notes (used to record who a
-- complimentary/staff-claim tender was for). Generic column, not
-- comp-specific — e.g. could later hold a QRIS reference number too.
--
-- The "Komplimen" feature itself needs no other schema change: it is
-- just another payment method string, resolved through the existing
-- pos_payment_method_mapping lookup (Fase 4) exactly like Cash/Card/
-- QRIS — an org maps it to an expense COA instead of an asset/cash COA,
-- and process_pos_order's per-tender GL debit already works unchanged
-- regardless of the mapped COA's type.

ALTER TABLE pos_order_payments ADD COLUMN notes TEXT;

CREATE OR REPLACE FUNCTION public.process_pos_order(p_org_id uuid, p_outlet_id uuid, p_cashier_id uuid, p_tenders jsonb, p_subtotal numeric, p_tax_amount numeric, p_total_amount numeric, p_lines jsonb, p_shift_id uuid DEFAULT NULL, p_client_request_id uuid DEFAULT NULL, p_order_discount_type text DEFAULT NULL, p_order_discount_value numeric DEFAULT NULL, p_order_discount_amount numeric DEFAULT 0, p_payment_summary text DEFAULT NULL)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order_id UUID;
  line RECORD;
  tender RECORD;
  bom_rec RECORD;
  v_revenue_coa_id UUID;
  v_cogs_coa_id UUID;
  v_inventory_coa_id UUID;
  v_payment_coa_id UUID;
  v_tax_coa_id UUID;
  v_qty_on_hand NUMERIC;
  v_inventory_value NUMERIC;
  v_avg_cost NUMERIC := 0;
  v_needed_qty NUMERIC;
  v_item_name TEXT;
  v_item_is_inventory BOOLEAN;
  v_total_cogs NUMERIC := 0;
  v_line_cogs NUMERIC := 0;
  v_has_bom BOOLEAN := FALSE;
  v_gl_status TEXT := 'posted';
  v_tenders_sum NUMERIC;
BEGIN
  IF p_client_request_id IS NOT NULL THEN
    SELECT id INTO v_order_id FROM pos_orders
    WHERE cashier_id = p_cashier_id AND client_request_id = p_client_request_id;

    IF v_order_id IS NOT NULL THEN
      RETURN v_order_id;
    END IF;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_tenders_sum
  FROM jsonb_to_recordset(p_tenders) AS x(amount NUMERIC);

  IF v_tenders_sum <> p_total_amount THEN
    RAISE EXCEPTION 'Tender amounts (%) do not sum to order total (%)', v_tenders_sum, p_total_amount;
  END IF;

  INSERT INTO pos_orders (org_id, outlet_id, cashier_id, status, subtotal, tax_amount, total_amount, payment_method, shift_id, client_request_id, discount_type, discount_value, discount_amount)
  VALUES (p_org_id, p_outlet_id, p_cashier_id, 'completed', p_subtotal, p_tax_amount, p_total_amount, COALESCE(p_payment_summary, 'Unknown'), p_shift_id, p_client_request_id, p_order_discount_type, p_order_discount_value, p_order_discount_amount)
  RETURNING id INTO v_order_id;

  SELECT revenue_coa_id, cogs_coa_id INTO v_revenue_coa_id, v_cogs_coa_id FROM pos_coa_mapping
  WHERE org_id = p_org_id AND pos_category = 'finished' AND (outlet_id = p_outlet_id OR outlet_id IS NULL)
  ORDER BY outlet_id NULLS LAST LIMIT 1;

  IF v_revenue_coa_id IS NULL THEN
    SELECT id INTO v_revenue_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code LIKE '4-%' AND is_header = false LIMIT 1;
  END IF;
  IF v_cogs_coa_id IS NULL THEN
    SELECT id INTO v_cogs_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code LIKE '5-%' AND is_header = false LIMIT 1;
  END IF;

  SELECT coa_id INTO v_inventory_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'pos_inventory';
  IF v_inventory_coa_id IS NULL THEN
    SELECT id INTO v_inventory_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code LIKE '1-3%' AND is_header = false LIMIT 1;
  END IF;

  SELECT coa_id INTO v_tax_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'ppn_keluaran';
  IF v_tax_coa_id IS NULL THEN
    SELECT id INTO v_tax_coa_id FROM chart_of_accounts
    WHERE org_id = p_org_id AND (name ILIKE '%tax%' OR name ILIKE '%ppn%') AND type = 'liability' AND is_header = false LIMIT 1;
  END IF;

  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    item_id UUID,
    qty NUMERIC,
    unit_price NUMERIC,
    subtotal NUMERIC,
    discount_type TEXT,
    discount_value NUMERIC,
    discount_amount NUMERIC
  )
  LOOP
    INSERT INTO pos_order_lines (order_id, item_id, qty, unit_price, subtotal, discount_type, discount_value, discount_amount)
    VALUES (v_order_id, line.item_id, line.qty, line.unit_price, line.subtotal, line.discount_type, line.discount_value, COALESCE(line.discount_amount, 0));

    v_line_cogs := 0;
    v_has_bom := FALSE;

    FOR bom_rec IN SELECT * FROM bom WHERE output_item_id = line.item_id
    LOOP
      v_has_bom := TRUE;

      SELECT is_inventory INTO v_item_is_inventory FROM item_master WHERE id = bom_rec.input_item_id;
      IF COALESCE(v_item_is_inventory, true) = false THEN
        CONTINUE;
      END IF;

      v_needed_qty := bom_rec.qty_per_unit * line.qty;

      SELECT qty_on_hand, inventory_value INTO v_qty_on_hand, v_inventory_value
      FROM inventory_balance WHERE outlet_id = p_outlet_id AND item_id = bom_rec.input_item_id FOR UPDATE;

      IF COALESCE(v_qty_on_hand, 0) < v_needed_qty THEN
        SELECT name INTO v_item_name FROM item_master WHERE id = bom_rec.input_item_id;
        RAISE EXCEPTION 'Insufficient stock: % needs % but only % available', COALESCE(v_item_name, 'item'), v_needed_qty, COALESCE(v_qty_on_hand, 0);
      END IF;

      v_avg_cost := COALESCE(CASE WHEN v_qty_on_hand > 0 THEN v_inventory_value / v_qty_on_hand ELSE 0 END, 0);

      v_line_cogs := v_line_cogs + (v_avg_cost * v_needed_qty);

      INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id, notes)
      VALUES (p_outlet_id, bom_rec.input_item_id, 'OUT', v_needed_qty, v_avg_cost, v_avg_cost * v_needed_qty, 'pos_order', v_order_id, 'POS Sale (Recipe Deduction)');

      UPDATE inventory_balance
      SET qty_on_hand = qty_on_hand - v_needed_qty,
          inventory_value = inventory_value - (v_avg_cost * v_needed_qty),
          updated_at = NOW()
      WHERE outlet_id = p_outlet_id AND item_id = bom_rec.input_item_id;
    END LOOP;

    IF NOT v_has_bom THEN
      SELECT is_inventory INTO v_item_is_inventory FROM item_master WHERE id = line.item_id;

      IF COALESCE(v_item_is_inventory, true) = true THEN
        SELECT qty_on_hand, inventory_value INTO v_qty_on_hand, v_inventory_value
        FROM inventory_balance WHERE outlet_id = p_outlet_id AND item_id = line.item_id FOR UPDATE;

        IF COALESCE(v_qty_on_hand, 0) < line.qty THEN
          SELECT name INTO v_item_name FROM item_master WHERE id = line.item_id;
          RAISE EXCEPTION 'Insufficient stock: % needs % but only % available', COALESCE(v_item_name, 'item'), line.qty, COALESCE(v_qty_on_hand, 0);
        END IF;

        v_avg_cost := COALESCE(CASE WHEN v_qty_on_hand > 0 THEN v_inventory_value / v_qty_on_hand ELSE 0 END, 0);
        v_line_cogs := v_avg_cost * line.qty;

        INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id, notes)
        VALUES (p_outlet_id, line.item_id, 'OUT', line.qty, v_avg_cost, v_line_cogs, 'pos_order', v_order_id, 'POS Sale');

        UPDATE inventory_balance
        SET qty_on_hand = qty_on_hand - line.qty,
            inventory_value = inventory_value - v_line_cogs,
            updated_at = NOW()
        WHERE outlet_id = p_outlet_id AND item_id = line.item_id;
      END IF;
    END IF;

    v_total_cogs := v_total_cogs + v_line_cogs;
  END LOOP;

  -- One GL debit line per tender + one pos_order_payments row per tender.
  -- notes flows through unchanged for any tender (comp-specific meaning
  -- is a UI/reporting convention, not enforced here).
  FOR tender IN SELECT * FROM jsonb_to_recordset(p_tenders) AS x(
    method TEXT,
    amount NUMERIC,
    cash_received NUMERIC,
    change_due NUMERIC,
    notes TEXT
  )
  LOOP
    INSERT INTO pos_order_payments (order_id, payment_method, amount, cash_received, change_due, notes)
    VALUES (v_order_id, tender.method, tender.amount, tender.cash_received, tender.change_due, tender.notes);

    v_payment_coa_id := NULL;
    SELECT coa_id INTO v_payment_coa_id FROM pos_payment_method_mapping
    WHERE org_id = p_org_id AND payment_method = tender.method AND (outlet_id = p_outlet_id OR outlet_id IS NULL)
    ORDER BY outlet_id NULLS LAST LIMIT 1;

    IF v_payment_coa_id IS NULL THEN
      SELECT id INTO v_payment_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code LIKE '1-1%' AND is_header = false LIMIT 1;
    END IF;

    IF v_payment_coa_id IS NOT NULL AND v_revenue_coa_id IS NOT NULL THEN
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (p_outlet_id, CURRENT_DATE, v_payment_coa_id, tender.amount, 0, v_order_id, 'pos_order', 'POS Sale Payment (' || tender.method || ')');
    ELSE
      v_gl_status := 'pending_mapping';
    END IF;
  END LOOP;

  IF v_revenue_coa_id IS NOT NULL THEN
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_revenue_coa_id, 0, p_subtotal, v_order_id, 'pos_order', 'POS Sale Revenue');
  ELSE
    v_gl_status := 'pending_mapping';
  END IF;

  IF p_tax_amount > 0 THEN
    IF v_tax_coa_id IS NOT NULL THEN
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (p_outlet_id, CURRENT_DATE, v_tax_coa_id, 0, p_tax_amount, v_order_id, 'pos_order', 'POS Tax Collected');
    ELSE
      v_gl_status := 'pending_mapping';
    END IF;
  END IF;

  IF v_total_cogs > 0 THEN
    IF v_cogs_coa_id IS NOT NULL AND v_inventory_coa_id IS NOT NULL THEN
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (p_outlet_id, CURRENT_DATE, v_cogs_coa_id, v_total_cogs, 0, v_order_id, 'pos_order', 'POS COGS');

      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (p_outlet_id, CURRENT_DATE, v_inventory_coa_id, 0, v_total_cogs, v_order_id, 'pos_order', 'POS Inventory Deduction');
    ELSE
      v_gl_status := 'pending_mapping';
    END IF;
  END IF;

  UPDATE pos_orders SET gl_status = v_gl_status WHERE id = v_order_id;

  RETURN v_order_id;
END;
$function$;
