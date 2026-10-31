-- POS void v2: keep the audit trail and close the authorization gap.
--
-- v1 (20260911130000_pos_void_order.sql) DELETEd the sale's stock_ledger and
-- gl_entries rows. That erased financial history (CLAUDE.md audit-trail rule)
-- and left three further problems:
--   1. The RPC is SECURITY DEFINER with no caller check of its own — only the
--      /api/pos/void route verified org + role, so any authenticated user who
--      called the RPC directly could void any order whose id they knew.
--   2. "Same-day" compared created_at::date (UTC) to CURRENT_DATE (UTC), but
--      the business day is Asia/Jakarta (UTC+7): a sale rung up 00:00-07:00 WIB
--      belongs to the previous UTC date.
--   3. Orders in an already-closed shift could be voided, silently invalidating
--      that shift's stored expected_cash / variance.
--
-- v2 posts REVERSING rows instead of deleting:
--   - stock_ledger: an 'IN' row per original 'OUT' row (reference_type
--     'pos_order_void'), same unit_cost, and inventory_balance is restored.
--   - gl_entries: every original line mirrored with debit/credit swapped
--     (reference_type 'pos_order_void'), so the journal nets to zero and
--     the original entries stay visible.
-- The original rows are never touched.

CREATE OR REPLACE FUNCTION public.void_pos_order(p_order_id UUID, p_reason TEXT)
 RETURNS VOID
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_order RECORD;
  v_role TEXT;
  v_org UUID;
  v_outlets UUID[];
  v_shift_status TEXT;
  v_today_wib DATE := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  line RECORD;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A void reason is required';
  END IF;

  SELECT org_id, role::text, outlet_ids INTO v_org, v_role, v_outlets
  FROM user_profiles WHERE id = auth.uid();

  -- Lock the order row so two concurrent voids can't both pass the status check.
  SELECT id, org_id, outlet_id, status, created_at, shift_id INTO v_order
  FROM pos_orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_org IS DISTINCT FROM v_order.org_id
     OR v_role NOT IN ('owner', 'admin', 'cashier')
     OR (v_role = 'cashier' AND NOT (v_order.outlet_id = ANY (COALESCE(v_outlets, '{}')))) THEN
    RAISE EXCEPTION 'Not allowed to void this order' USING ERRCODE = '42501';
  END IF;

  IF v_order.status <> 'completed' THEN
    RAISE EXCEPTION 'Only completed orders can be voided (current status: %)', v_order.status;
  END IF;

  IF (v_order.created_at AT TIME ZONE 'Asia/Jakarta')::date <> v_today_wib THEN
    RAISE EXCEPTION 'Only same-day orders can be voided';
  END IF;

  IF v_order.shift_id IS NOT NULL THEN
    SELECT status INTO v_shift_status FROM pos_shifts WHERE id = v_order.shift_id;
    IF v_shift_status = 'closed' THEN
      RAISE EXCEPTION 'This order belongs to a closed shift and can no longer be voided';
    END IF;
  END IF;

  -- Reverse exactly what the sale deducted, per its own ledger rows (not
  -- recomputed from bom/is_inventory, so it can't drift if those changed).
  FOR line IN
    SELECT item_id, qty, unit_cost, total_value
    FROM stock_ledger
    WHERE reference_type = 'pos_order' AND reference_id = p_order_id AND txn_type = 'OUT'
  LOOP
    UPDATE inventory_balance
    SET qty_on_hand = qty_on_hand + line.qty,
        inventory_value = inventory_value + line.total_value,
        updated_at = NOW()
    WHERE outlet_id = v_order.outlet_id AND item_id = line.item_id;

    INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id, notes)
    VALUES (v_order.outlet_id, line.item_id, 'IN', line.qty, line.unit_cost, line.total_value,
            'pos_order_void', p_order_id, 'POS Void: ' || btrim(p_reason));
  END LOOP;

  -- Mirror every journal line with debit/credit swapped. A set-based insert
  -- of the exact mirror is balanced by construction (original was balanced).
  INSERT INTO gl_entries (outlet_id, org_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
  SELECT outlet_id, org_id, v_today_wib, coa_id, credit, debit, reference_id, 'pos_order_void',
         'VOID: ' || COALESCE(description, '')
  FROM gl_entries
  WHERE reference_type = 'pos_order' AND reference_id = p_order_id;

  UPDATE pos_orders
  SET status = 'voided', voided_by = auth.uid(), voided_at = NOW(), void_reason = btrim(p_reason)
  WHERE id = p_order_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.void_pos_order(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.void_pos_order(UUID, TEXT) TO authenticated, service_role;
