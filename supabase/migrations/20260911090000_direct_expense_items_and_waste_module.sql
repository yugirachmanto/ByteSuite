-- Fase 4, Part A: close the direct-expense (non-inventory) item gap found
-- this session. post_goods_receipt/post_invoice already correctly skip
-- stock writes for is_inventory=false lines while still posting a GL debit
-- (the "expense immediately at purchase" mechanism already works there).
-- But process_pos_order and post_production never check is_inventory at
-- all on BOM inputs:
--   - process_pos_order created a bogus negative inventory_balance row
--     (via an INSERT that never hits its own ON CONFLICT, since no row
--     existed yet) and silently zeroed COGS for a non-inventory ingredient.
--   - post_production hard-blocked with "Insufficient stock: needs X but
--     only 0 is available" for ANY recipe containing a non-inventory input,
--     since stock_batches is empty for such items by design.
-- Fix: check is_inventory on each BOM input before touching stock tables;
-- for non-inventory inputs, skip cleanly (no stock rows, zero cost
-- contribution — the cost was already recognized as an expense when the
-- item was purchased, not when it's later sold/produced).

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
  v_input_is_inventory BOOLEAN;
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

      -- Direct-expense ingredient (is_inventory=false): its cost was already
      -- recognized when it was purchased, not now. Skip stock/COGS entirely —
      -- no stock_ledger row, no inventory_balance row (previously this branch
      -- created a bogus negative-qty inventory_balance row for such items).
      SELECT is_inventory INTO v_input_is_inventory FROM item_master WHERE id = bom_rec.input_item_id;
      IF COALESCE(v_input_is_inventory, true) = false THEN
        CONTINUE;
      END IF;

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

    -- If no BOM found, deduct the item directly (e.g. canned drinks) —
    -- unless the item itself is direct-expense (is_inventory=false).
    IF NOT v_has_bom THEN
      SELECT is_inventory INTO v_input_is_inventory FROM item_master WHERE id = line.item_id;
      IF COALESCE(v_input_is_inventory, true) THEN
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
-- post_production (5-arg / FIFO version) — same is_inventory fix.
-- ============================================================
CREATE OR REPLACE FUNCTION public.post_production(p_outlet_id uuid, p_wip_item_id uuid, p_qty_produced numeric, p_production_date date, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  bom_line          RECORD;
  batch             RECORD;
  v_log_id          UUID;
  v_total_cost      NUMERIC := 0;
  v_line_qty        NUMERIC;
  v_line_cost       NUMERIC;
  v_unit_cost       NUMERIC;
  v_remaining       NUMERIC;
  v_consume         NUMERIC;
  v_available       NUMERIC;
  v_item_name       TEXT;
  v_touched_prices  NUMERIC[];
  v_output_coa_id   UUID;
  v_input_coa_id    UUID;
  v_input_is_inventory BOOLEAN;
BEGIN
  IF p_qty_produced IS NULL OR p_qty_produced <= 0 THEN
    RAISE EXCEPTION 'Quantity produced must be greater than 0';
  END IF;

  -- Pre-check every account this production run will need to post to,
  -- before touching a single row of stock — fail fast with a clear message.
  SELECT default_coa_id INTO v_output_coa_id FROM item_master WHERE id = p_wip_item_id;
  IF v_output_coa_id IS NULL THEN
    SELECT name INTO v_item_name FROM item_master WHERE id = p_wip_item_id;
    RAISE EXCEPTION 'Item "%" has no Default Account configured. Set one in Settings > Items before logging production.', COALESCE(v_item_name, p_wip_item_id::text);
  END IF;

  -- Only inventory-tracked BOM inputs need a Default Account here —
  -- direct-expense inputs are skipped entirely below and never post GL
  -- from this function (their cost was already expensed at purchase).
  FOR bom_line IN SELECT * FROM bom WHERE output_item_id = p_wip_item_id
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM item_master
      WHERE id = bom_line.input_item_id AND (is_inventory = false OR default_coa_id IS NOT NULL)
    ) THEN
      SELECT name INTO v_item_name FROM item_master WHERE id = bom_line.input_item_id;
      RAISE EXCEPTION 'Item "%" has no Default Account configured. Set one in Settings > Items before logging production.', COALESCE(v_item_name, bom_line.input_item_id::text);
    END IF;
  END LOOP;

  -- a. Create Production Log with authenticated user tracking
  INSERT INTO production_log (outlet_id, wip_item_id, qty_produced, production_date, notes, created_by)
  VALUES (p_outlet_id, p_wip_item_id, p_qty_produced, p_production_date, p_notes, auth.uid())
  RETURNING id INTO v_log_id;

  -- b. Deduct raw materials based on BOM, walking real batches FIFO
  FOR bom_line IN SELECT * FROM bom WHERE output_item_id = p_wip_item_id
  LOOP
    v_line_qty := bom_line.qty_per_unit * p_qty_produced;
    IF v_line_qty <= 0 THEN
      CONTINUE;
    END IF;

    -- Direct-expense input (is_inventory=false): already expensed at
    -- purchase time. No stock to consume, no cost to contribute here.
    SELECT is_inventory INTO v_input_is_inventory FROM item_master WHERE id = bom_line.input_item_id;
    IF COALESCE(v_input_is_inventory, true) = false THEN
      CONTINUE;
    END IF;

    -- Quick pre-check for a clear error message (final correctness is still
    -- enforced below after locks are held, in case of a concurrent race).
    SELECT COALESCE(SUM(qty_remaining), 0) INTO v_available
    FROM stock_batches
    WHERE outlet_id = p_outlet_id AND item_id = bom_line.input_item_id AND qty_remaining > 0.0001;

    IF v_available + 0.0001 < v_line_qty THEN
      SELECT name INTO v_item_name FROM item_master WHERE id = bom_line.input_item_id;
      RAISE EXCEPTION 'Insufficient stock: % needs % but only % is available', COALESCE(v_item_name, bom_line.input_item_id::text), v_line_qty, v_available;
    END IF;

    v_remaining := v_line_qty;
    v_touched_prices := ARRAY[]::NUMERIC[];

    -- Lock and walk this ingredient's batches oldest-first; FOR UPDATE
    -- serializes concurrent productions consuming the same stock and, on
    -- lock-wait, re-reads the latest committed qty_remaining.
    FOR batch IN
      SELECT id, qty_remaining, unit_cost
      FROM stock_batches
      WHERE outlet_id = p_outlet_id AND item_id = bom_line.input_item_id AND qty_remaining > 0.0001
      ORDER BY purchase_date ASC, created_at ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0.0001;
      v_consume := LEAST(batch.qty_remaining, v_remaining);

      UPDATE stock_batches SET qty_remaining = qty_remaining - v_consume WHERE id = batch.id;

      IF NOT (batch.unit_cost = ANY(v_touched_prices)) THEN
        v_touched_prices := array_append(v_touched_prices, batch.unit_cost);
      END IF;

      v_remaining := v_remaining - v_consume;
    END LOOP;

    -- Re-check after acquiring locks: a concurrent production could have
    -- consumed stock between the pre-check above and the locks being granted.
    IF v_remaining > 0.0001 THEN
      SELECT name INTO v_item_name FROM item_master WHERE id = bom_line.input_item_id;
      RAISE EXCEPTION 'Insufficient stock: % needs % but only % could be reserved (concurrent production consumed the rest)', COALESCE(v_item_name, bom_line.input_item_id::text), v_line_qty, v_line_qty - v_remaining;
    END IF;

    -- Simple average of UNIQUE unit prices touched (matches calcFifoAvg in fifo-avg.ts)
    SELECT ROUND(AVG(p)) INTO v_unit_cost FROM unnest(v_touched_prices) AS p;
    v_line_cost := ROUND(v_unit_cost * v_line_qty);
    v_total_cost := v_total_cost + v_line_cost;

    UPDATE inventory_balance
    SET qty_on_hand = qty_on_hand - v_line_qty,
        inventory_value = inventory_value - v_line_cost,
        updated_at = NOW()
    WHERE outlet_id = p_outlet_id AND item_id = bom_line.input_item_id;

    INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
    VALUES (p_outlet_id, bom_line.input_item_id, 'PRODUCTION_OUT', -v_line_qty, v_unit_cost, v_line_cost, 'production', v_log_id);

    -- GL: credit this input item's own inventory account (value leaving it).
    SELECT default_coa_id INTO v_input_coa_id FROM item_master WHERE id = bom_line.input_item_id;
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, p_production_date, v_input_coa_id, 0, v_line_cost, v_log_id, 'production', 'Production Consumption');
  END LOOP;

  -- c. Add WIP to inventory as its own new batch (so it FIFO-consumes correctly
  -- if it's itself an input to a deeper WIP level), plus the summary balance.
  INSERT INTO stock_batches (outlet_id, item_id, purchase_date, original_qty, qty_remaining, unit_cost)
  VALUES (p_outlet_id, p_wip_item_id, p_production_date, p_qty_produced, p_qty_produced, ROUND(v_total_cost / p_qty_produced));

  INSERT INTO inventory_balance (outlet_id, item_id, qty_on_hand, inventory_value)
  VALUES (p_outlet_id, p_wip_item_id, p_qty_produced, v_total_cost)
  ON CONFLICT (outlet_id, item_id)
  DO UPDATE SET
    qty_on_hand = inventory_balance.qty_on_hand + EXCLUDED.qty_on_hand,
    inventory_value = inventory_balance.inventory_value + EXCLUDED.inventory_value,
    updated_at = NOW();

  INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
  VALUES (p_outlet_id, p_wip_item_id, 'PRODUCTION_IN', p_qty_produced, ROUND(v_total_cost / p_qty_produced), v_total_cost, 'production', v_log_id);

  -- GL: debit the produced WIP item's own inventory account (value arriving).
  -- Balanced by construction — v_total_cost is the sum of every credit above.
  IF v_total_cost > 0 THEN
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, p_production_date, v_output_coa_id, v_total_cost, 0, v_log_id, 'production', 'Production Output');
  END IF;

  -- Update log with calculated cost
  UPDATE production_log SET unit_cost = ROUND(v_total_cost / p_qty_produced) WHERE id = v_log_id;
END;
$function$;

-- ============================================================
-- Fase 4, Part B: standalone Waste/Spoilage module (log any day, not
-- tied to the weekly opname count). Only meaningful for items that are
-- actually inventory-tracked — direct-expense items have no stock to
-- waste (their cost is already fully recognized at purchase time).
-- ============================================================

-- stock_ledger.txn_type is a Postgres enum (ledger_txn_type), not a plain
-- TEXT column with a CHECK constraint — a new value needs an explicit
-- ALTER TYPE, and (per Postgres rules) cannot be *used* in the same
-- transaction that adds it. Safe here because nothing in this migration
-- executes the post_waste function body at CREATE time.
ALTER TYPE ledger_txn_type ADD VALUE IF NOT EXISTS 'WASTE';

CREATE TABLE waste_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  item_id UUID NOT NULL REFERENCES item_master(id),
  qty NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL,
  total_value NUMERIC NOT NULL,
  waste_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT NOT NULL CHECK (reason IN ('spoilage', 'expired', 'damaged', 'prep_waste', 'other')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE waste_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Outlet access" ON waste_log FOR ALL USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
);

CREATE OR REPLACE FUNCTION public.post_waste(
  p_outlet_id UUID, p_org_id UUID, p_item_id UUID, p_qty NUMERIC,
  p_waste_date DATE, p_reason TEXT, p_notes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  batch             RECORD;
  v_available       NUMERIC;
  v_remaining       NUMERIC;
  v_consume         NUMERIC;
  v_touched_prices  NUMERIC[];
  v_unit_cost       NUMERIC;
  v_total_value     NUMERIC;
  v_item_name       TEXT;
  v_expense_coa_id  UUID;
  v_inventory_coa_id UUID;
  v_waste_id        UUID;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be greater than 0';
  END IF;

  v_waste_id := gen_random_uuid();

  -- Resolve accounts before touching any stock — fail fast, back-office
  -- flow (kitchen/finance), safe to hard-block like opname/production.
  SELECT coa_id INTO v_expense_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'opname_waste_expense';
  SELECT default_coa_id INTO v_inventory_coa_id FROM item_master WHERE id = p_item_id;

  IF v_expense_coa_id IS NULL THEN
    RAISE EXCEPTION 'Cost of Food Spoilage/Waste account is not configured. Set it in Settings > Accounting Rules.';
  END IF;
  IF v_inventory_coa_id IS NULL THEN
    SELECT name INTO v_item_name FROM item_master WHERE id = p_item_id;
    RAISE EXCEPTION 'Item "%" has no Default Account configured. Set one in Settings > Items before logging waste.', COALESCE(v_item_name, p_item_id::text);
  END IF;

  SELECT COALESCE(SUM(qty_remaining), 0) INTO v_available
  FROM stock_batches WHERE outlet_id = p_outlet_id AND item_id = p_item_id AND qty_remaining > 0.0001;

  IF v_available + 0.0001 < p_qty THEN
    SELECT name INTO v_item_name FROM item_master WHERE id = p_item_id;
    RAISE EXCEPTION 'Insufficient stock: % needs % but only % is available', COALESCE(v_item_name, p_item_id::text), p_qty, v_available;
  END IF;

  v_remaining := p_qty;
  v_touched_prices := ARRAY[]::NUMERIC[];

  FOR batch IN
    SELECT id, qty_remaining, unit_cost FROM stock_batches
    WHERE outlet_id = p_outlet_id AND item_id = p_item_id AND qty_remaining > 0.0001
    ORDER BY purchase_date ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0.0001;
    v_consume := LEAST(batch.qty_remaining, v_remaining);
    UPDATE stock_batches SET qty_remaining = qty_remaining - v_consume WHERE id = batch.id;
    IF NOT (batch.unit_cost = ANY(v_touched_prices)) THEN
      v_touched_prices := array_append(v_touched_prices, batch.unit_cost);
    END IF;
    v_remaining := v_remaining - v_consume;
  END LOOP;

  IF v_remaining > 0.0001 THEN
    SELECT name INTO v_item_name FROM item_master WHERE id = p_item_id;
    RAISE EXCEPTION 'Insufficient stock: % needs % but only % could be reserved (concurrent transaction consumed the rest)', COALESCE(v_item_name, p_item_id::text), p_qty, p_qty - v_remaining;
  END IF;

  SELECT ROUND(AVG(p)) INTO v_unit_cost FROM unnest(v_touched_prices) AS p;
  v_total_value := ROUND(v_unit_cost * p_qty);

  UPDATE inventory_balance
  SET qty_on_hand = qty_on_hand - p_qty, inventory_value = inventory_value - v_total_value, updated_at = NOW()
  WHERE outlet_id = p_outlet_id AND item_id = p_item_id;

  INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
  VALUES (p_outlet_id, p_item_id, 'WASTE', -p_qty, v_unit_cost, v_total_value, 'waste', v_waste_id);

  INSERT INTO waste_log (id, outlet_id, item_id, qty, unit_cost, total_value, waste_date, reason, notes, created_by)
  VALUES (v_waste_id, p_outlet_id, p_item_id, p_qty, v_unit_cost, v_total_value, COALESCE(p_waste_date, CURRENT_DATE), p_reason, p_notes, auth.uid());

  INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
  VALUES (p_outlet_id, COALESCE(p_waste_date, CURRENT_DATE), v_expense_coa_id, v_total_value, 0, v_waste_id, 'waste', 'Waste/Spoilage Expense');

  INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
  VALUES (p_outlet_id, COALESCE(p_waste_date, CURRENT_DATE), v_inventory_coa_id, 0, v_total_value, v_waste_id, 'waste', 'Waste/Spoilage Inventory Reduction');

  RETURN v_waste_id;
END;
$function$;
