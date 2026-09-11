-- POS Fase 3: void a completed order. Mirrors the house void pattern
-- (void_invoice, void_goods_receipt) — guard checks, reverse
-- inventory_balance, DELETE the original stock_ledger/gl_entries rows
-- (not reversing journal entries), flip the header status.
--
-- Reverses stock by reading the sale's own stock_ledger 'OUT' rows rather
-- than recomputing from bom/is_inventory, so it can't drift if the recipe
-- or item flags changed since the sale.

ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS voided_by UUID REFERENCES auth.users(id);
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS void_reason TEXT;

CREATE OR REPLACE FUNCTION public.void_pos_order(p_order_id UUID, p_reason TEXT)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_status TEXT;
  v_created_at TIMESTAMPTZ;
  v_outlet_id UUID;
  line RECORD;
BEGIN
  SELECT status, created_at, outlet_id INTO v_status, v_created_at, v_outlet_id
  FROM pos_orders WHERE id = p_order_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_status <> 'completed' THEN
    RAISE EXCEPTION 'Only completed orders can be voided (current status: %)', v_status;
  END IF;

  IF v_created_at::date <> CURRENT_DATE THEN
    RAISE EXCEPTION 'Only same-day orders can be voided';
  END IF;

  -- Reverse exactly what was deducted, per the sale's own ledger rows.
  FOR line IN
    SELECT item_id, qty, total_value
    FROM stock_ledger
    WHERE reference_type = 'pos_order' AND reference_id = p_order_id AND txn_type = 'OUT'
  LOOP
    UPDATE inventory_balance
    SET qty_on_hand = qty_on_hand + line.qty,
        inventory_value = inventory_value + line.total_value,
        updated_at = NOW()
    WHERE outlet_id = v_outlet_id AND item_id = line.item_id;
  END LOOP;

  DELETE FROM stock_ledger WHERE reference_type = 'pos_order' AND reference_id = p_order_id;
  DELETE FROM gl_entries WHERE reference_type = 'pos_order' AND reference_id = p_order_id;

  UPDATE pos_orders
  SET status = 'voided', voided_by = auth.uid(), voided_at = NOW(), void_reason = p_reason
  WHERE id = p_order_id;
END;
$function$;
