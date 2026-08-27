-- Fix post_production: enforce no-negative-stock server-side, consume raw
-- materials via real FIFO batch walking (stock_batches) with simple-average-
-- of-unique-price costing (matching src/lib/inventory/fifo-avg.ts), and give
-- the produced WIP its own batch so nested WIP levels FIFO-consume correctly.
--
-- Previous version (20240526000002_fix_production_log_author.sql) only
-- touched inventory_balance using a quantity-weighted average
-- (inventory_value / qty_on_hand), never touched stock_batches at all, and
-- had no server-side guard against qty_on_hand going negative — only the
-- client-side button check in production/new/page.tsx protected against it,
-- so a direct RPC call or a race between two concurrent productions could
-- push stock negative and silently drift stock_batches out of sync with
-- inventory_balance.
--
-- This targets the 5-arg overload, the only one called by app code
-- (confirmed: grep found no callers of the 7-arg p_total_cost/p_input_deductions
-- overload, which is left untouched).

CREATE OR REPLACE FUNCTION post_production(
  p_outlet_id UUID,
  p_wip_item_id UUID,
  p_qty_produced DECIMAL,
  p_production_date DATE,
  p_notes TEXT
) RETURNS VOID AS $$
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
BEGIN
  IF p_qty_produced IS NULL OR p_qty_produced <= 0 THEN
    RAISE EXCEPTION 'Quantity produced must be greater than 0';
  END IF;

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

  -- Update log with calculated cost
  UPDATE production_log SET unit_cost = ROUND(v_total_cost / p_qty_produced) WHERE id = v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
