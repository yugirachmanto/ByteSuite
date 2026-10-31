-- POS refunds (partial or full return of a completed order's lines).
--
-- Scope of this first version, by design:
--   * Refund = revenue/tax reversal + money back to the customer. Stock and
--     COGS are NOT reversed: refunded food has been prepared/served, so its
--     ingredient cost stays an expense. (Restock-on-refund can be added later
--     per line; a wrongly-rung order that never left the kitchen should use
--     void instead, which restores stock.)
--   * Only owner/admin can refund (same bar as discounts).
--   * Refunds post their own journal (reference_type 'pos_refund'); the
--     original sale's entries are never edited or deleted.
--   * Cash refunds are tied to an OPEN shift and reduce that shift's expected
--     cash at close (close_pos_shift patched below).
--   * An order with refunds cannot be voided, and a refunded order must have
--     a fully posted GL (not pending_mapping) so the reversal has something
--     real to reverse.
--
-- Also fixes: a voided order that was still 'pending_mapping' could be picked
-- up by repost_pending_pos_gl and journaled as a sale. Void now marks such
-- orders gl_status = 'void' (repost only touches 'pending_mapping').

ALTER TABLE pos_orders DROP CONSTRAINT IF EXISTS pos_orders_gl_status_check;
ALTER TABLE pos_orders ADD CONSTRAINT pos_orders_gl_status_check
  CHECK (gl_status IN ('posted', 'pending_mapping', 'void'));

CREATE TABLE pos_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  order_id UUID NOT NULL REFERENCES pos_orders(id),
  shift_id UUID REFERENCES pos_shifts(id),
  payment_method TEXT NOT NULL,
  subtotal NUMERIC NOT NULL,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  rounding_amount NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  refunded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_pos_refunds_order ON pos_refunds (order_id);
CREATE INDEX idx_pos_refunds_shift ON pos_refunds (shift_id);
CREATE INDEX idx_pos_refunds_outlet_created ON pos_refunds (outlet_id, created_at);

CREATE TABLE pos_refund_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id UUID NOT NULL REFERENCES pos_refunds(id) ON DELETE CASCADE,
  order_line_id UUID NOT NULL REFERENCES pos_order_lines(id),
  item_id UUID NOT NULL,
  qty NUMERIC NOT NULL CHECK (qty > 0),
  amount NUMERIC NOT NULL
);
CREATE INDEX idx_pos_refund_lines_refund ON pos_refund_lines (refund_id);
CREATE INDEX idx_pos_refund_lines_order_line ON pos_refund_lines (order_line_id);

ALTER TABLE pos_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_refund_lines ENABLE ROW LEVEL SECURITY;

-- Read-only for the roles that can read pos_orders; all writes go through
-- refund_pos_order (SECURITY DEFINER).
CREATE POLICY "POS refunds select" ON pos_refunds FOR SELECT TO authenticated
  USING (
    org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','cashier','finance','viewer')
  );
CREATE POLICY "POS refund lines select" ON pos_refund_lines FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM pos_refunds r WHERE r.id = pos_refund_lines.refund_id
      AND r.org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
      AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','cashier','finance','viewer')
  ));

-- Same revenue-account resolution the sale uses (category mapping, then the
-- 'finished' mapping, then the first 4-xxx account).
CREATE OR REPLACE FUNCTION public._pos_line_revenue_coa(p_org UUID, p_outlet UUID, p_item UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cat TEXT;
  v_coa UUID;
BEGIN
  SELECT COALESCE(NULLIF(btrim(pos_category), ''), 'Uncategorized') INTO v_cat FROM item_master WHERE id = p_item;
  SELECT m.revenue_coa_id INTO v_coa FROM pos_coa_mapping m
  WHERE m.org_id = p_org AND lower(m.pos_category) = lower(COALESCE(v_cat, 'Uncategorized'))
    AND (m.outlet_id = p_outlet OR m.outlet_id IS NULL)
  ORDER BY m.outlet_id NULLS LAST LIMIT 1;
  IF v_coa IS NULL THEN
    SELECT m.revenue_coa_id INTO v_coa FROM pos_coa_mapping m
    WHERE m.org_id = p_org AND m.pos_category = 'finished' AND (m.outlet_id = p_outlet OR m.outlet_id IS NULL)
    ORDER BY m.outlet_id NULLS LAST LIMIT 1;
  END IF;
  IF v_coa IS NULL THEN
    SELECT id INTO v_coa FROM chart_of_accounts WHERE org_id = p_org AND code LIKE '4-%' AND is_header = false LIMIT 1;
  END IF;
  RETURN v_coa;
END;
$$;
REVOKE ALL ON FUNCTION public._pos_line_revenue_coa(UUID, UUID, UUID) FROM public, anon, authenticated;

-- p_lines: [{ "order_line_id": uuid, "qty": number }, ...]
CREATE OR REPLACE FUNCTION public.refund_pos_order(
  p_order_id UUID,
  p_lines JSONB,
  p_method TEXT,
  p_reason TEXT,
  p_shift_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order RECORD;
  v_role TEXT;
  v_org UUID;
  v_shift_ok BOOLEAN;
  v_today DATE := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  req RECORD;
  ln RECORD;
  v_lines_total NUMERIC;
  v_prior_qty NUMERIC;
  v_prior_amt NUMERIC;
  v_share NUMERIC;
  v_net_full NUMERIC;
  v_net NUMERIC;
  v_net_sum NUMERIC := 0;
  v_prior_tax NUMERIC;
  v_prior_round NUMERIC;
  v_prior_total NUMERIC;
  v_prior_sub NUMERIC;
  v_tax NUMERIC := 0;
  v_round NUMERIC := 0;
  v_total NUMERIC;
  v_all_full BOOLEAN;
  v_line_rows JSONB := '[]'::jsonb;
  v_alloc JSONB := '{}'::jsonb;
  v_coa UUID;
  v_pay_coa UUID;
  v_tax_coa UUID;
  v_round_coa UUID;
  v_refund_id UUID;
  v_entry RECORD;
  v_n_lines INTEGER;
  v_n_distinct INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A refund reason is required';
  END IF;
  IF p_method IS NULL OR btrim(p_method) = '' THEN
    RAISE EXCEPTION 'A refund payment method is required';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Select at least one line to refund';
  END IF;

  SELECT org_id, role::text INTO v_org, v_role FROM user_profiles WHERE id = auth.uid();

  -- Lock the order so concurrent refunds cannot both pass the remaining-qty check.
  SELECT * INTO v_order FROM pos_orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_org IS DISTINCT FROM v_order.org_id OR v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only an owner or admin can refund this order' USING ERRCODE = '42501';
  END IF;
  IF v_order.status <> 'completed' THEN
    RAISE EXCEPTION 'Only completed orders can be refunded (current status: %)', v_order.status;
  END IF;
  IF v_order.gl_status <> 'posted' THEN
    RAISE EXCEPTION 'This sale is not fully journaled yet (complete the POS account mapping and repost first)';
  END IF;

  IF p_shift_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM pos_shifts WHERE id = p_shift_id AND org_id = v_order.org_id
        AND outlet_id = v_order.outlet_id AND status = 'open'
    ) INTO v_shift_ok;
    IF NOT v_shift_ok THEN
      RAISE EXCEPTION 'The selected shift is not open at this outlet';
    END IF;
  ELSIF p_method ILIKE 'cash' THEN
    RAISE EXCEPTION 'Cash refunds must be recorded against an open shift';
  END IF;

  SELECT jsonb_array_length(p_lines), COUNT(DISTINCT x.order_line_id)
  INTO v_n_lines, v_n_distinct
  FROM jsonb_to_recordset(p_lines) AS x(order_line_id UUID, qty NUMERIC);
  IF v_n_lines <> v_n_distinct THEN
    RAISE EXCEPTION 'Each order line may appear only once in a refund';
  END IF;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_lines_total FROM pos_order_lines WHERE order_id = p_order_id;

  SELECT COALESCE(SUM(subtotal), 0), COALESCE(SUM(tax_amount), 0), COALESCE(SUM(rounding_amount), 0), COALESCE(SUM(amount), 0)
  INTO v_prior_sub, v_prior_tax, v_prior_round, v_prior_total
  FROM pos_refunds WHERE order_id = p_order_id;

  FOR req IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(order_line_id UUID, qty NUMERIC)
  LOOP
    IF req.qty IS NULL OR req.qty <= 0 THEN
      RAISE EXCEPTION 'Refund quantity must be greater than zero';
    END IF;

    SELECT * INTO ln FROM pos_order_lines WHERE id = req.order_line_id AND order_id = p_order_id;
    IF ln.id IS NULL THEN
      RAISE EXCEPTION 'Line does not belong to this order';
    END IF;

    SELECT COALESCE(SUM(rl.qty), 0), COALESCE(SUM(rl.amount), 0) INTO v_prior_qty, v_prior_amt
    FROM pos_refund_lines rl WHERE rl.order_line_id = ln.id;

    IF v_prior_qty + req.qty > ln.qty THEN
      RAISE EXCEPTION 'Cannot refund % of a line that sold % (already refunded %)', req.qty, ln.qty, v_prior_qty;
    END IF;

    -- Net revenue of this line after its share of the order-level discount,
    -- computed exactly like the sale's revenue allocation.
    v_share := CASE WHEN v_lines_total > 0
                    THEN ROUND(COALESCE(v_order.discount_amount, 0) * ln.subtotal / v_lines_total) ELSE 0 END;
    v_net_full := ln.subtotal - v_share;
    -- The final unit(s) take the exact remainder so repeated partial refunds
    -- never drift from the amount actually recognized.
    v_net := CASE WHEN v_prior_qty + req.qty = ln.qty
                  THEN v_net_full - v_prior_amt
                  ELSE ROUND(v_net_full * req.qty / ln.qty) END;

    v_coa := public._pos_line_revenue_coa(v_order.org_id, v_order.outlet_id, ln.item_id);
    IF v_coa IS NULL THEN
      RAISE EXCEPTION 'No revenue account is mapped for this item; set one in Settings > Accounting > POS Mapping';
    END IF;
    v_alloc := jsonb_set(v_alloc, ARRAY[v_coa::text],
      to_jsonb(COALESCE((v_alloc->>(v_coa::text))::numeric, 0) + v_net), true);

    v_net_sum := v_net_sum + v_net;
    v_line_rows := v_line_rows || jsonb_build_object(
      'order_line_id', ln.id, 'item_id', ln.item_id, 'qty', req.qty, 'amount', v_net);
  END LOOP;

  -- Tax and rounding come back proportionally; once every unit of the order
  -- has been refunded they take the exact remainder.
  SELECT NOT EXISTS (
    SELECT 1
    FROM pos_order_lines l
    LEFT JOIN (
      SELECT rl.order_line_id, SUM(rl.qty) AS q
      FROM pos_refund_lines rl JOIN pos_refunds r ON r.id = rl.refund_id
      WHERE r.order_id = p_order_id GROUP BY rl.order_line_id
    ) pr ON pr.order_line_id = l.id
    LEFT JOIN jsonb_to_recordset(p_lines) AS x(order_line_id UUID, qty NUMERIC) ON x.order_line_id = l.id
    WHERE l.order_id = p_order_id AND l.qty > COALESCE(pr.q, 0) + COALESCE(x.qty, 0)
  ) INTO v_all_full;

  IF v_all_full THEN
    v_tax := COALESCE(v_order.tax_amount, 0) - v_prior_tax;
    v_round := COALESCE(v_order.rounding_amount, 0) - v_prior_round;
  ELSE
    v_tax := CASE WHEN COALESCE(v_order.subtotal, 0) > 0
                  THEN ROUND(COALESCE(v_order.tax_amount, 0) * v_net_sum / v_order.subtotal) ELSE 0 END;
    v_tax := LEAST(v_tax, COALESCE(v_order.tax_amount, 0) - v_prior_tax);
    v_round := 0;
  END IF;

  v_total := v_net_sum + v_tax + v_round;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Refund amount must be greater than zero';
  END IF;
  IF v_prior_total + v_total > v_order.total_amount THEN
    RAISE EXCEPTION 'Refund would exceed the amount paid for this order';
  END IF;

  -- Resolve the remaining accounts; all-or-nothing, so a refund can never
  -- leave a one-sided or partial journal.
  SELECT coa_id INTO v_pay_coa FROM pos_payment_method_mapping
  WHERE org_id = v_order.org_id AND payment_method = p_method
    AND (outlet_id = v_order.outlet_id OR outlet_id IS NULL)
  ORDER BY outlet_id NULLS LAST LIMIT 1;
  IF v_pay_coa IS NULL THEN
    SELECT id INTO v_pay_coa FROM chart_of_accounts
    WHERE org_id = v_order.org_id AND code LIKE '1-1%' AND is_header = false LIMIT 1;
  END IF;
  IF v_pay_coa IS NULL THEN
    RAISE EXCEPTION 'No account is mapped for payment method %', p_method;
  END IF;

  IF v_tax > 0 THEN
    SELECT coa_id INTO v_tax_coa FROM default_coa_mappings WHERE org_id = v_order.org_id AND account_role = 'ppn_keluaran';
    IF v_tax_coa IS NULL THEN
      SELECT id INTO v_tax_coa FROM chart_of_accounts
      WHERE org_id = v_order.org_id AND (name ILIKE '%tax%' OR name ILIKE '%ppn%') AND type = 'liability' AND is_header = false LIMIT 1;
    END IF;
    IF v_tax_coa IS NULL THEN
      RAISE EXCEPTION 'No output-tax (PPN Keluaran) account is configured';
    END IF;
  END IF;

  IF v_round > 0 THEN
    SELECT coa_id INTO v_round_coa FROM default_coa_mappings WHERE org_id = v_order.org_id AND account_role = 'pos_rounding';
    IF v_round_coa IS NULL THEN
      SELECT revenue_coa_id INTO v_round_coa FROM pos_coa_mapping
      WHERE org_id = v_order.org_id AND pos_category = 'finished' AND (outlet_id = v_order.outlet_id OR outlet_id IS NULL)
      ORDER BY outlet_id NULLS LAST LIMIT 1;
    END IF;
    IF v_round_coa IS NULL THEN
      SELECT id INTO v_round_coa FROM chart_of_accounts WHERE org_id = v_order.org_id AND code LIKE '4-%' AND is_header = false LIMIT 1;
    END IF;
    IF v_round_coa IS NULL THEN
      RAISE EXCEPTION 'No rounding account is configured';
    END IF;
  END IF;

  INSERT INTO pos_refunds (org_id, outlet_id, order_id, shift_id, payment_method, subtotal, tax_amount, rounding_amount, amount, reason, refunded_by)
  VALUES (v_order.org_id, v_order.outlet_id, p_order_id, p_shift_id, p_method, v_net_sum, v_tax, v_round, v_total, btrim(p_reason), auth.uid())
  RETURNING id INTO v_refund_id;

  INSERT INTO pos_refund_lines (refund_id, order_line_id, item_id, qty, amount)
  SELECT v_refund_id, (r->>'order_line_id')::uuid, (r->>'item_id')::uuid, (r->>'qty')::numeric, (r->>'amount')::numeric
  FROM jsonb_array_elements(v_line_rows) r;

  -- Journal: Dr revenue (per account) [+ Dr tax, Dr rounding] / Cr payment.
  FOR v_entry IN SELECT key, value::numeric AS amount FROM jsonb_each_text(v_alloc)
  LOOP
    IF v_entry.amount <> 0 THEN
      INSERT INTO gl_entries (outlet_id, org_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (v_order.outlet_id, v_order.org_id, v_today, v_entry.key::uuid, v_entry.amount, 0, v_refund_id, 'pos_refund', 'POS Refund Revenue');
    END IF;
  END LOOP;
  IF v_tax > 0 THEN
    INSERT INTO gl_entries (outlet_id, org_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (v_order.outlet_id, v_order.org_id, v_today, v_tax_coa, v_tax, 0, v_refund_id, 'pos_refund', 'POS Refund Tax');
  END IF;
  IF v_round > 0 THEN
    INSERT INTO gl_entries (outlet_id, org_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (v_order.outlet_id, v_order.org_id, v_today, v_round_coa, v_round, 0, v_refund_id, 'pos_refund', 'POS Refund Rounding');
  END IF;
  INSERT INTO gl_entries (outlet_id, org_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
  VALUES (v_order.outlet_id, v_order.org_id, v_today, v_pay_coa, 0, v_total, v_refund_id, 'pos_refund', 'POS Refund Payment (' || p_method || ')');

  RETURN v_refund_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.refund_pos_order(UUID, JSONB, TEXT, TEXT, UUID) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.refund_pos_order(UUID, JSONB, TEXT, TEXT, UUID) TO authenticated, service_role;

-- void v3: refunded orders cannot be voided; voided orders are never reposted.
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

  IF EXISTS (SELECT 1 FROM pos_refunds WHERE order_id = p_order_id) THEN
    RAISE EXCEPTION 'This order has refunds and can no longer be voided';
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
  SET status = 'voided', gl_status = 'void', voided_by = auth.uid(), voided_at = NOW(), void_reason = btrim(p_reason)
  WHERE id = p_order_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.void_pos_order(UUID, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.void_pos_order(UUID, TEXT) TO authenticated, service_role;

-- close_pos_shift: expected cash now nets cash refunds paid out during the shift.
CREATE OR REPLACE FUNCTION public.close_pos_shift(p_shift_id uuid, p_counted_cash numeric, p_notes text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_status TEXT;
  v_cashier_id UUID;
  v_org_id UUID;
  v_outlet_id UUID;
  v_opening_float NUMERIC;
  v_caller_role TEXT;
  v_cash_sales NUMERIC;
  v_cash_refunds NUMERIC;
  v_expected NUMERIC;
  v_variance NUMERIC;
  v_cash_coa_id UUID;
  v_variance_coa_id UUID;
BEGIN
  SELECT status, cashier_id, org_id, outlet_id, opening_float
  INTO v_status, v_cashier_id, v_org_id, v_outlet_id, v_opening_float
  FROM pos_shifts WHERE id = p_shift_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Shift not found';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'Only an open shift can be closed';
  END IF;

  SELECT role INTO v_caller_role FROM user_profiles WHERE id = auth.uid();
  IF auth.uid() <> v_cashier_id AND v_caller_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Only the shift owner or an owner/admin can close this shift';
  END IF;

  SELECT COALESCE(SUM(p.amount), 0) INTO v_cash_sales
  FROM pos_order_payments p
  JOIN pos_orders o ON o.id = p.order_id
  WHERE o.shift_id = p_shift_id AND o.status = 'completed' AND p.payment_method ILIKE 'cash';

  -- Cash handed back to customers during this shift (refunds) leaves the drawer.
  SELECT COALESCE(SUM(r.amount), 0) INTO v_cash_refunds
  FROM pos_refunds r
  WHERE r.shift_id = p_shift_id AND r.payment_method ILIKE 'cash';

  v_expected := v_opening_float + v_cash_sales - v_cash_refunds;
  v_variance := p_counted_cash - v_expected;

  IF v_variance <> 0 THEN
    SELECT coa_id INTO v_cash_coa_id FROM pos_payment_method_mapping
    WHERE org_id = v_org_id AND payment_method ILIKE 'cash' AND (outlet_id = v_outlet_id OR outlet_id IS NULL)
    ORDER BY outlet_id NULLS LAST LIMIT 1;
    IF v_cash_coa_id IS NULL THEN
      SELECT id INTO v_cash_coa_id FROM chart_of_accounts WHERE org_id = v_org_id AND code LIKE '1-1%' AND is_header = false LIMIT 1;
    END IF;

    SELECT coa_id INTO v_variance_coa_id FROM default_coa_mappings WHERE org_id = v_org_id AND account_role = 'shift_cash_variance';

    IF v_cash_coa_id IS NULL OR v_variance_coa_id IS NULL THEN
      RAISE EXCEPTION 'Cash Over/Short (Shift Variance) account is not configured in Settings > Accounting Rules.';
    END IF;

    IF v_variance < 0 THEN
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (v_outlet_id, CURRENT_DATE, v_variance_coa_id, ABS(v_variance), 0, p_shift_id, 'pos_shift', 'Shift Cash Short');
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (v_outlet_id, CURRENT_DATE, v_cash_coa_id, 0, ABS(v_variance), p_shift_id, 'pos_shift', 'Shift Cash Short');
    ELSE
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (v_outlet_id, CURRENT_DATE, v_cash_coa_id, ABS(v_variance), 0, p_shift_id, 'pos_shift', 'Shift Cash Over');
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (v_outlet_id, CURRENT_DATE, v_variance_coa_id, 0, ABS(v_variance), p_shift_id, 'pos_shift', 'Shift Cash Over');
    END IF;
  END IF;

  UPDATE pos_shifts
  SET status = 'closed', closing_counted = p_counted_cash, closing_notes = p_notes,
      expected_cash = v_expected, variance = v_variance, closed_at = NOW()
  WHERE id = p_shift_id;
END;
$function$;
