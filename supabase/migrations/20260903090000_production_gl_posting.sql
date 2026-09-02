-- Fase 1: post_production never touched gl_entries — inventory value moved
-- from Raw Material to WIP in stock_batches/inventory_balance, but the GL
-- accounts for those two balance-sheet lines stayed frozen forever, never
-- reflecting the actual production activity. This is a back-office flow
-- (not customer-facing), so it hard-fails on missing item COA config,
-- matching the opname pattern from Fase 0 — verified against live data
-- that every raw/wip item already has item_master.default_coa_id set, so
-- this does not block any org's existing production workflow today.
--
-- Only the 5-argument overload is touched — it's the only one called from
-- the app (grep confirmed a single call-site in production/new/page.tsx).
-- The 7-argument overload (p_total_cost, p_input_deductions) is unused
-- dead code, left untouched here.

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

  FOR bom_line IN SELECT * FROM bom WHERE output_item_id = p_wip_item_id
  LOOP
    IF NOT EXISTS (SELECT 1 FROM item_master WHERE id = bom_line.input_item_id AND default_coa_id IS NOT NULL) THEN
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
