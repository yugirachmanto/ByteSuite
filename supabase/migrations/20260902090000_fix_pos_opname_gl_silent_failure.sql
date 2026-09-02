-- Fase 0: close the silent-failure GL posting gaps in POS checkout and
-- opname submission (both were found to complete their operational writes
-- — stock movement, order/log rows — while quietly inserting zero
-- gl_entries rows when a needed COA mapping resolves to NULL, invisible to
-- the balance trigger since 0=0 is trivially balanced).
--
-- Policy (per product decision): POS checkout must never block a live sale
-- for missing accounting config — an incompletely-mapped sale is now
-- flagged via pos_orders.gl_status instead of silently dropped, with a
-- repost RPC to catch it up later. Opname is back-office, not
-- customer-facing, so it hard-fails instead, matching the purchasing
-- module's post_goods_receipt/post_matched_invoice pattern.

ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS gl_status TEXT NOT NULL DEFAULT 'posted'
  CHECK (gl_status IN ('posted', 'pending_mapping'));

-- ============================================================
-- process_pos_order — POS checkout always completes; GL posting
-- that can't fully resolve its accounts is flagged, not dropped.
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
  v_avg_cost NUMERIC := 0;
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
  -- first, then the old name-pattern fallback (fixed: parenthesized, the previous version's
  -- `name ILIKE '%tax%' OR name ILIKE '%ppn%' AND type='liability'` let AND's tighter binding
  -- match any non-liability account named e.g. "Tax Expense").
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
-- repost_pending_pos_gl — catch up GL postings for orders flagged
-- pending_mapping, once the org's COA mapping has been completed.
-- Idempotent per (reference_id, coa_id) pair so it's safe to call
-- repeatedly (e.g. a button in Settings > POS Mapping).
-- ============================================================
CREATE OR REPLACE FUNCTION public.repost_pending_pos_gl(p_org_id uuid)
 RETURNS INTEGER
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  ord RECORD;
  v_revenue_coa_id UUID;
  v_cogs_coa_id UUID;
  v_inventory_coa_id UUID;
  v_payment_coa_id UUID;
  v_tax_coa_id UUID;
  v_total_cogs NUMERIC;
  v_gl_status TEXT;
  v_posted_count INTEGER := 0;
BEGIN
  FOR ord IN SELECT * FROM pos_orders WHERE org_id = p_org_id AND gl_status = 'pending_mapping'
  LOOP
    v_gl_status := 'posted';

    SELECT coa_id INTO v_payment_coa_id FROM pos_payment_method_mapping
    WHERE org_id = p_org_id AND payment_method = ord.payment_method AND (outlet_id = ord.outlet_id OR outlet_id IS NULL)
    ORDER BY outlet_id NULLS LAST LIMIT 1;
    IF v_payment_coa_id IS NULL THEN
      SELECT id INTO v_payment_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code LIKE '1-1%' AND is_header = false LIMIT 1;
    END IF;

    SELECT revenue_coa_id, cogs_coa_id INTO v_revenue_coa_id, v_cogs_coa_id FROM pos_coa_mapping
    WHERE org_id = p_org_id AND pos_category = 'finished' AND (outlet_id = ord.outlet_id OR outlet_id IS NULL)
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

    SELECT COALESCE(SUM(total_value), 0) INTO v_total_cogs
    FROM stock_ledger WHERE reference_type = 'pos_order' AND reference_id = ord.id AND txn_type = 'OUT';

    IF v_payment_coa_id IS NOT NULL AND v_revenue_coa_id IS NOT NULL THEN
      IF NOT EXISTS (SELECT 1 FROM gl_entries WHERE reference_id = ord.id AND coa_id = v_payment_coa_id) THEN
        INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
        VALUES (ord.outlet_id, CURRENT_DATE, v_payment_coa_id, ord.total_amount, 0, ord.id, 'pos_order', 'POS Sale Payment (reposted)');
      END IF;
      IF NOT EXISTS (SELECT 1 FROM gl_entries WHERE reference_id = ord.id AND coa_id = v_revenue_coa_id) THEN
        INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
        VALUES (ord.outlet_id, CURRENT_DATE, v_revenue_coa_id, 0, ord.subtotal, ord.id, 'pos_order', 'POS Sale Revenue (reposted)');
      END IF;
    ELSE
      v_gl_status := 'pending_mapping';
    END IF;

    IF ord.tax_amount > 0 THEN
      IF v_tax_coa_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM gl_entries WHERE reference_id = ord.id AND coa_id = v_tax_coa_id) THEN
          INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
          VALUES (ord.outlet_id, CURRENT_DATE, v_tax_coa_id, 0, ord.tax_amount, ord.id, 'pos_order', 'POS Tax Collected (reposted)');
        END IF;
      ELSE
        v_gl_status := 'pending_mapping';
      END IF;
    END IF;

    IF v_total_cogs > 0 THEN
      IF v_cogs_coa_id IS NOT NULL AND v_inventory_coa_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM gl_entries WHERE reference_id = ord.id AND coa_id = v_cogs_coa_id) THEN
          INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
          VALUES (ord.outlet_id, CURRENT_DATE, v_cogs_coa_id, v_total_cogs, 0, ord.id, 'pos_order', 'POS COGS (reposted)');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM gl_entries WHERE reference_id = ord.id AND coa_id = v_inventory_coa_id) THEN
          INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
          VALUES (ord.outlet_id, CURRENT_DATE, v_inventory_coa_id, 0, v_total_cogs, ord.id, 'pos_order', 'POS Inventory Deduction (reposted)');
        END IF;
      ELSE
        v_gl_status := 'pending_mapping';
      END IF;
    END IF;

    IF v_gl_status = 'posted' THEN
      v_posted_count := v_posted_count + 1;
    END IF;
    UPDATE pos_orders SET gl_status = v_gl_status WHERE id = ord.id;
  END LOOP;

  RETURN v_posted_count;
END;
$function$;

-- ============================================================
-- submit_opname — hard-fail on missing mapping (back-office flow,
-- safe to block), post GL for overage too, and resolve accounts via
-- default_coa_mappings instead of hardcoded chart_of_accounts codes.
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_opname(p_outlet_id uuid, p_org_id uuid, p_opname_date date, p_items jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  item                RECORD;
  v_log_id            UUID;
  v_variance          NUMERIC;
  v_avg_cost          NUMERIC;
  v_value_adjustment  NUMERIC;
  v_new_inventory_value NUMERIC;
  v_inventory_coa_id  UUID;
  v_expense_coa_id    UUID;
  v_expense_role      TEXT;
  v_count             INT := 0;
BEGIN
  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    item_id UUID, item_name TEXT, item_category TEXT,
    system_qty NUMERIC, physical_qty NUMERIC, inventory_value NUMERIC, variance_reason TEXT
  )
  LOOP
    v_count := v_count + 1;

    INSERT INTO opname_log (outlet_id, opname_date, item_id, system_qty, physical_qty, variance_reason, created_by)
    VALUES (p_outlet_id, p_opname_date, item.item_id, item.system_qty, item.physical_qty, item.variance_reason, auth.uid())
    RETURNING id INTO v_log_id;

    v_variance := item.physical_qty - item.system_qty;
    IF v_variance = 0 THEN
      CONTINUE;
    END IF;

    v_avg_cost := CASE WHEN item.system_qty > 0 THEN item.inventory_value / item.system_qty ELSE 0 END;
    v_value_adjustment := ROUND(v_variance * v_avg_cost);
    v_new_inventory_value := GREATEST(0, item.inventory_value + v_value_adjustment);

    UPDATE opname_log SET variance_value = v_value_adjustment WHERE id = v_log_id;

    UPDATE inventory_balance
    SET qty_on_hand = item.physical_qty,
        inventory_value = v_new_inventory_value,
        updated_at = NOW()
    WHERE outlet_id = p_outlet_id AND item_id = item.item_id;

    INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
    VALUES (p_outlet_id, item.item_id, 'OPNAME_ADJ', v_variance, ROUND(v_avg_cost), ABS(v_value_adjustment), 'opname', v_log_id);

    -- Any variance (deficit OR overage) with a stated reason posts a GL entry.
    IF item.variance_reason IS NOT NULL AND ABS(v_value_adjustment) > 0 THEN
      -- Overage is never spoilage/waste by definition — only a deficit can be.
      IF v_variance < 0 AND item.variance_reason IN ('spoilage', 'waste') AND item.item_category IN ('raw', 'wip', 'finished') THEN
        v_expense_role := 'opname_waste_expense';
      ELSE
        v_expense_role := 'opname_variance_expense';
      END IF;

      SELECT coa_id INTO v_inventory_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'opname_inventory';
      SELECT coa_id INTO v_expense_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = v_expense_role;

      IF v_inventory_coa_id IS NULL OR v_expense_coa_id IS NULL THEN
        RAISE EXCEPTION 'Akun untuk % belum diatur di Settings > Accounting Rules. Atur mapping "opname_inventory" dan "%" terlebih dahulu.', v_expense_role, v_expense_role;
      END IF;

      IF v_variance < 0 THEN
        -- Deficit: debit expense, credit inventory (asset down).
        INSERT INTO gl_entries (org_id, outlet_id, entry_date, coa_id, debit, credit, reference_type, reference_id, description)
        VALUES (p_org_id, p_outlet_id, p_opname_date, v_expense_coa_id, ABS(v_value_adjustment), 0, 'opname', v_log_id, 'Opname Variance Expense - ' || COALESCE(item.item_name, ''));

        INSERT INTO gl_entries (org_id, outlet_id, entry_date, coa_id, debit, credit, reference_type, reference_id, description)
        VALUES (p_org_id, p_outlet_id, p_opname_date, v_inventory_coa_id, 0, ABS(v_value_adjustment), 'opname', v_log_id, 'Inventory Asset Reduction - ' || COALESCE(item.item_name, ''));
      ELSE
        -- Overage: debit inventory (asset up), credit variance expense (a gain — reduces net expense).
        INSERT INTO gl_entries (org_id, outlet_id, entry_date, coa_id, debit, credit, reference_type, reference_id, description)
        VALUES (p_org_id, p_outlet_id, p_opname_date, v_inventory_coa_id, ABS(v_value_adjustment), 0, 'opname', v_log_id, 'Inventory Asset Increase - ' || COALESCE(item.item_name, ''));

        INSERT INTO gl_entries (org_id, outlet_id, entry_date, coa_id, debit, credit, reference_type, reference_id, description)
        VALUES (p_org_id, p_outlet_id, p_opname_date, v_expense_coa_id, 0, ABS(v_value_adjustment), 'opname', v_log_id, 'Opname Variance Gain - ' || COALESCE(item.item_name, ''));
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$function$;
