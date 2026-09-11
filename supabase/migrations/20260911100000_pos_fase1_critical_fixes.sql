-- POS Fase 1: critical correctness/security fixes found in the POS audit.
--
-- 1. process_pos_order let stock go negative with no check at all — this
--    directly violates CLAUDE.md's own "No negative stock" rule. Now locks
--    each inventory_balance row (FOR UPDATE, same pattern as
--    post_goods_receipt/post_vendor_return) and hard-fails naming the
--    specific item when qty_on_hand is insufficient, exactly like the
--    back-office flows (post_production, submit_opname) already do — this
--    is a physical-reality check, not an accounting-config gap, so it does
--    NOT use POS's own gap-tolerant gl_status='pending_mapping' policy.
-- 2. pos_orders/pos_order_lines had a single org-scoped "FOR ALL" policy —
--    any authenticated org member (viewer included) could write orders
--    directly. Replaced with the same 4-policy role-aware template used in
--    20260910090000_role_enforcement_financial_tables.sql for the other 8
--    core financial tables (missed there since POS wasn't in scope yet).

-- ============================================================
-- process_pos_order — add insufficient-stock guard
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_pos_order(p_org_id uuid, p_outlet_id uuid, p_cashier_id uuid, p_payment_method text, p_subtotal numeric, p_tax_amount numeric, p_total_amount numeric, p_lines jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_order_id UUID;
  line RECORD;
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
  v_total_cogs NUMERIC := 0;
  v_line_cogs NUMERIC := 0;
  v_has_bom BOOLEAN := FALSE;
  v_gl_status TEXT := 'posted';
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

  -- Resolve Inventory COA — default_coa_mappings first, then the old global-code fallback
  SELECT coa_id INTO v_inventory_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'pos_inventory';
  IF v_inventory_coa_id IS NULL THEN
    SELECT id INTO v_inventory_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code LIKE '1-3%' AND is_header = false LIMIT 1;
  END IF;

  -- Resolve Tax Liability COA — reuse the existing 'ppn_keluaran' (Output Tax) role mapping
  -- first, then the old name-pattern fallback.
  SELECT coa_id INTO v_tax_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'ppn_keluaran';
  IF v_tax_coa_id IS NULL THEN
    SELECT id INTO v_tax_coa_id FROM chart_of_accounts
    WHERE org_id = p_org_id AND (name ILIKE '%tax%' OR name ILIKE '%ppn%') AND type = 'liability' AND is_header = false LIMIT 1;
  END IF;

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
      v_needed_qty := bom_rec.qty_per_unit * line.qty;

      -- Lock the row so two concurrent sales of the same low-stock
      -- ingredient can't both pass the check before either deducts.
      SELECT qty_on_hand, inventory_value INTO v_qty_on_hand, v_inventory_value
      FROM inventory_balance WHERE outlet_id = p_outlet_id AND item_id = bom_rec.input_item_id FOR UPDATE;

      IF COALESCE(v_qty_on_hand, 0) < v_needed_qty THEN
        SELECT name INTO v_item_name FROM item_master WHERE id = bom_rec.input_item_id;
        RAISE EXCEPTION 'Insufficient stock: % needs % but only % available', COALESCE(v_item_name, 'item'), v_needed_qty, COALESCE(v_qty_on_hand, 0);
      END IF;

      v_avg_cost := COALESCE(CASE WHEN v_qty_on_hand > 0 THEN v_inventory_value / v_qty_on_hand ELSE 0 END, 0);

      -- Add to line COGS
      v_line_cogs := v_line_cogs + (v_avg_cost * v_needed_qty);

      -- Deduct ingredient from Stock Ledger
      INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id, notes)
      VALUES (p_outlet_id, bom_rec.input_item_id, 'OUT', v_needed_qty, v_avg_cost, v_avg_cost * v_needed_qty, 'pos_order', v_order_id, 'POS Sale (Recipe Deduction)');

      -- Deduct ingredient from Inventory Balance
      UPDATE inventory_balance
      SET qty_on_hand = qty_on_hand - v_needed_qty,
          inventory_value = inventory_value - (v_avg_cost * v_needed_qty),
          updated_at = NOW()
      WHERE outlet_id = p_outlet_id AND item_id = bom_rec.input_item_id;
    END LOOP;

    -- If no BOM found, deduct the item directly (e.g. canned drinks)
    IF NOT v_has_bom THEN
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

    -- Add line COGS to total COGS
    v_total_cogs := v_total_cogs + v_line_cogs;
  END LOOP;

  -- GL Entries
  -- 1 & 2. Payment + Revenue (always required for a completed sale)
  IF v_payment_coa_id IS NOT NULL AND v_revenue_coa_id IS NOT NULL THEN
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_payment_coa_id, p_total_amount, 0, v_order_id, 'pos_order', 'POS Sale Payment');

    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_revenue_coa_id, 0, p_subtotal, v_order_id, 'pos_order', 'POS Sale Revenue');
  ELSE
    v_gl_status := 'pending_mapping';
  END IF;

  -- 3. Tax Liability (only required if tax was actually collected)
  IF p_tax_amount > 0 THEN
    IF v_tax_coa_id IS NOT NULL THEN
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (p_outlet_id, CURRENT_DATE, v_tax_coa_id, 0, p_tax_amount, v_order_id, 'pos_order', 'POS Tax Collected');
    ELSE
      v_gl_status := 'pending_mapping';
    END IF;
  END IF;

  -- 4. COGS & Inventory entries (only required if inventory was actually tracked/consumed)
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

-- ============================================================
-- pos_orders / pos_order_lines — role-aware RLS
-- write: owner/admin/cashier (who actually process sales)
-- read: those + finance/viewer (reporting/reconciliation)
-- ============================================================
DROP POLICY IF EXISTS "Org access pos_orders" ON pos_orders;

CREATE POLICY "POS orders select" ON pos_orders FOR SELECT USING (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','cashier','finance','viewer')
);
CREATE POLICY "POS orders insert" ON pos_orders FOR INSERT WITH CHECK (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','cashier')
);
CREATE POLICY "POS orders update" ON pos_orders FOR UPDATE USING (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','cashier')
);
CREATE POLICY "POS orders delete" ON pos_orders FOR DELETE USING (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin')
);

DROP POLICY IF EXISTS "Org access pos_order_lines" ON pos_order_lines;

CREATE POLICY "POS order lines select" ON pos_order_lines FOR SELECT USING (
  order_id IN (SELECT id FROM pos_orders WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','cashier','finance','viewer')
);
CREATE POLICY "POS order lines insert" ON pos_order_lines FOR INSERT WITH CHECK (
  order_id IN (SELECT id FROM pos_orders WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','cashier')
);
CREATE POLICY "POS order lines update" ON pos_order_lines FOR UPDATE USING (
  order_id IN (SELECT id FROM pos_orders WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','cashier')
);
CREATE POLICY "POS order lines delete" ON pos_order_lines FOR DELETE USING (
  order_id IN (SELECT id FROM pos_orders WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin')
);
