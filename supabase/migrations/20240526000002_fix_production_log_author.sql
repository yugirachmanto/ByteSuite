-- Migration: Fix production log author tracking and user profile RLS visibility
-- This ensures post_production RPC functions capture auth.uid() in created_by column,
-- backfills legacy NULLs, and solves same-org user profile RLS SELECT visibility to prevent "Unknown" authors.

-- 1. Create secure helper function to bypass RLS and retrieve current user's organization ID
CREATE OR REPLACE FUNCTION public.get_user_org_id()
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.user_profiles WHERE id = auth.uid();
$$;

-- 2. Add RLS policy allowing users in the same organization to view each other's profiles
DROP POLICY IF EXISTS "Users can view same-org profiles" ON user_profiles;
CREATE POLICY "Users can view same-org profiles"
  ON public.user_profiles
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id());

-- 3. Backfill existing legacy records where created_by is NULL
UPDATE production_log
SET created_by = (
  SELECT id FROM user_profiles
  WHERE org_id IS NOT NULL AND is_active = true
  ORDER BY role = 'owner' DESC, created_at ASC
  LIMIT 1
)
WHERE created_by IS NULL;

-- 4. Update post_production RPC with 5 parameters (used in client app logging)
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
  -- a. Create Production Log with authenticated user tracking
  INSERT INTO production_log (outlet_id, wip_item_id, qty_produced, production_date, notes, created_by)
  VALUES (p_outlet_id, p_wip_item_id, p_qty_produced, p_production_date, p_notes, auth.uid())
  RETURNING id INTO v_log_id;

  -- b. Deduct Raw Materials based on BOM
  FOR bom_line IN SELECT * FROM bom WHERE output_item_id = p_wip_item_id
  LOOP
    -- Calculate cost using average cost from inventory balance
    SELECT COALESCE((inventory_value / NULLIF(qty_on_hand, 0)) * (bom_line.qty_per_unit * p_qty_produced), 0)
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
    VALUES (p_outlet_id, bom_line.input_item_id, 'PRODUCTION_OUT', -(bom_line.qty_per_unit * p_qty_produced), COALESCE(v_line_cost / NULLIF(bom_line.qty_per_unit * p_qty_produced, 0), 0), v_line_cost, 'production', v_log_id);
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
  VALUES (p_outlet_id, p_wip_item_id, 'PRODUCTION_IN', p_qty_produced, COALESCE(v_total_cost / NULLIF(p_qty_produced, 0), 0), v_total_cost, 'production', v_log_id);

  -- Update log with calculated cost
  UPDATE production_log SET unit_cost = COALESCE(v_total_cost / NULLIF(p_qty_produced, 0), 0) WHERE id = v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Update post_production RPC with 7 parameters (optional alternative version)
CREATE OR REPLACE FUNCTION post_production(
  p_outlet_id        UUID,
  p_wip_item_id      UUID,
  p_qty_produced     DECIMAL,
  p_production_date  DATE,
  p_notes            TEXT,
  p_total_cost       DECIMAL,
  p_input_deductions JSONB
) RETURNS VOID AS $$
DECLARE
  v_log_id   UUID;
  deduction  RECORD;
BEGIN
  -- Create Production Log with authenticated user tracking
  INSERT INTO production_log (outlet_id, wip_item_id, qty_produced, production_date, unit_cost, notes, created_by)
  VALUES (p_outlet_id, p_wip_item_id, p_qty_produced, p_production_date,
          COALESCE(p_total_cost / NULLIF(p_qty_produced, 0), 0), p_notes, auth.uid())
  RETURNING id INTO v_log_id;

  -- Deduct Raw Materials (from JSON payload)
  FOR deduction IN SELECT * FROM jsonb_to_recordset(p_input_deductions) AS x(item_id UUID, qty DECIMAL, cost DECIMAL)
  LOOP
    -- Update Inventory Balance (Deduct)
    UPDATE inventory_balance
    SET qty_on_hand     = qty_on_hand - deduction.qty,
        inventory_value = inventory_value - deduction.cost,
        updated_at      = NOW()
    WHERE outlet_id = p_outlet_id AND item_id = deduction.item_id;

    -- Stock Ledger (OUT)
    INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
    VALUES (p_outlet_id, deduction.item_id, 'PRODUCTION_OUT', -deduction.qty,
            COALESCE(deduction.cost / NULLIF(deduction.qty, 0), 0), deduction.cost, 'production', v_log_id);
  END LOOP;

  -- Add WIP to Inventory Balance (Add)
  INSERT INTO inventory_balance (outlet_id, item_id, qty_on_hand, inventory_value)
  VALUES (p_outlet_id, p_wip_item_id, p_qty_produced, p_total_cost)
  ON CONFLICT (outlet_id, item_id)
  DO UPDATE SET
    qty_on_hand     = inventory_balance.qty_on_hand + EXCLUDED.qty_on_hand,
    inventory_value = inventory_balance.inventory_value + EXCLUDED.inventory_value,
    updated_at      = NOW();

  -- Stock Ledger (IN)
  INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
  VALUES (p_outlet_id, p_wip_item_id, 'PRODUCTION_IN', p_qty_produced,
          COALESCE(p_total_cost / NULLIF(p_qty_produced, 0), 0), p_total_cost, 'production', v_log_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
