-- Per-item order notes + Kitchen/Bar display (KDS).
--
-- * pos_order_lines.note: free-text note per cart item ("tanpa bawang"...).
-- * pos_station_mapping: which station (kitchen / bar / none) each POS
--   category is prepared at; unmapped categories default to kitchen.
-- * kds_tickets: one ticket per (order, station), created automatically by a
--   trigger when an order's lines are inserted (i.e. at payment), so it is
--   atomic with the sale and needs no change to the checkout flow.
-- * get_kds_tickets / complete_kds_ticket: SECURITY DEFINER RPCs so the
--   kitchen role can work the screen without read access to sales tables.

ALTER TABLE pos_order_lines ADD COLUMN IF NOT EXISTS note TEXT;

-- ── Station mapping ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_station_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  pos_category TEXT NOT NULL,
  station TEXT NOT NULL CHECK (station IN ('kitchen', 'bar', 'none')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pos_station_mapping_org_category_key ON pos_station_mapping (org_id, lower(pos_category));
ALTER TABLE pos_station_mapping ENABLE ROW LEVEL SECURITY;
CREATE POLICY "station mapping read" ON pos_station_mapping FOR SELECT USING (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','cashier','kitchen','finance','viewer')
);
CREATE POLICY "station mapping write" ON pos_station_mapping FOR ALL USING (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin')
) WITH CHECK (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin')
);

CREATE OR REPLACE FUNCTION pos_item_station(p_org UUID, p_item UUID) RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT sm.station FROM pos_station_mapping sm
      WHERE sm.org_id = p_org
        AND lower(sm.pos_category) = lower(COALESCE(NULLIF(btrim((SELECT pos_category FROM item_master WHERE id = p_item)), ''), 'Uncategorized'))),
    'kitchen')
$$;

-- ── Tickets ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS kds_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  outlet_id UUID NOT NULL REFERENCES outlets(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  station TEXT NOT NULL CHECK (station IN ('kitchen', 'bar')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'done')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at TIMESTAMPTZ,
  done_by UUID REFERENCES auth.users(id),
  UNIQUE (order_id, station)
);
CREATE INDEX IF NOT EXISTS kds_tickets_outlet_station_status_idx ON kds_tickets (outlet_id, station, status);
ALTER TABLE kds_tickets ENABLE ROW LEVEL SECURITY;
-- Read-only for the app (needed for realtime); writes go through the RPCs/trigger.
CREATE POLICY "kds tickets read" ON kds_tickets FOR SELECT USING (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','cashier','kitchen')
);

CREATE OR REPLACE FUNCTION create_kds_ticket_for_line() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org UUID;
  v_outlet UUID;
  v_station TEXT;
BEGIN
  SELECT org_id, outlet_id INTO v_org, v_outlet FROM pos_orders WHERE id = NEW.order_id;
  IF v_org IS NULL THEN RETURN NEW; END IF;
  v_station := pos_item_station(v_org, NEW.item_id);
  IF v_station IN ('kitchen', 'bar') THEN
    INSERT INTO kds_tickets (org_id, outlet_id, order_id, station)
    VALUES (v_org, v_outlet, NEW.order_id, v_station)
    ON CONFLICT (order_id, station) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_create_kds_ticket ON pos_order_lines;
CREATE TRIGGER trg_create_kds_ticket AFTER INSERT ON pos_order_lines
  FOR EACH ROW EXECUTE FUNCTION create_kds_ticket_for_line();

-- Realtime (new-ticket push). The screen also polls, so this is an accelerator.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE kds_tickets;
EXCEPTION WHEN duplicate_object THEN NULL;
          WHEN undefined_object THEN NULL;
END $$;

-- ── RPCs ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_kds_tickets(p_outlet_id UUID, p_station TEXT, p_include_done BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org UUID;
  v_role TEXT;
BEGIN
  SELECT org_id, role::text INTO v_org, v_role FROM user_profiles WHERE id = auth.uid();
  IF v_org IS NULL OR v_role NOT IN ('owner','admin','cashier','kitchen') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM outlets WHERE id = p_outlet_id AND org_id = v_org) THEN
    RAISE EXCEPTION 'Outlet not in your organization';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(t.obj ORDER BY t.created_at)
    FROM (
      SELECT k.created_at,
        jsonb_build_object(
          'ticket_id', k.id,
          'order_id', k.order_id,
          'order_no', upper(left(k.order_id::text, 8)),
          'station', k.station,
          'status', k.status,
          'created_at', k.created_at,
          'done_at', k.done_at,
          'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('name', im.name, 'qty', ol.qty, 'note', ol.note) ORDER BY im.name)
            FROM pos_order_lines ol JOIN item_master im ON im.id = ol.item_id
            WHERE ol.order_id = k.order_id AND pos_item_station(v_org, ol.item_id) = k.station
          ), '[]'::jsonb)
        ) AS obj
      FROM kds_tickets k
      JOIN pos_orders o ON o.id = k.order_id
      WHERE k.outlet_id = p_outlet_id
        AND k.org_id = v_org
        AND k.station = p_station
        AND o.status = 'completed'
        AND (k.status = 'new' OR (p_include_done AND k.done_at > now() - interval '30 minutes'))
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION complete_kds_ticket(p_ticket_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org UUID;
  v_role TEXT;
BEGIN
  SELECT org_id, role::text INTO v_org, v_role FROM user_profiles WHERE id = auth.uid();
  IF v_org IS NULL OR v_role NOT IN ('owner','admin','cashier','kitchen') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE kds_tickets SET status = 'done', done_at = now(), done_by = auth.uid()
  WHERE id = p_ticket_id AND org_id = v_org AND status = 'new';
END;
$$;

CREATE OR REPLACE FUNCTION reopen_kds_ticket(p_ticket_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org UUID;
  v_role TEXT;
BEGIN
  SELECT org_id, role::text INTO v_org, v_role FROM user_profiles WHERE id = auth.uid();
  IF v_org IS NULL OR v_role NOT IN ('owner','admin','cashier','kitchen') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE kds_tickets SET status = 'new', done_at = NULL, done_by = NULL
  WHERE id = p_ticket_id AND org_id = v_org AND status = 'done';
END;
$$;

GRANT EXECUTE ON FUNCTION get_kds_tickets(UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_kds_ticket(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reopen_kds_ticket(UUID) TO authenticated;

-- ── process_pos_order: persist the per-item note ─────────────────────────────
CREATE OR REPLACE FUNCTION public.process_pos_order(p_org_id uuid, p_outlet_id uuid, p_cashier_id uuid, p_tenders jsonb, p_subtotal numeric, p_tax_amount numeric, p_total_amount numeric, p_lines jsonb, p_shift_id uuid DEFAULT NULL, p_client_request_id uuid DEFAULT NULL, p_order_discount_type text DEFAULT NULL, p_order_discount_value numeric DEFAULT NULL, p_order_discount_amount numeric DEFAULT 0, p_payment_summary text DEFAULT NULL, p_rounding_amount numeric DEFAULT 0)
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
  v_gl_complete BOOLEAN := TRUE;
  v_rounding_coa_id UUID;
  v_debits JSONB := '[]'::jsonb;
  v_debit JSONB;
  v_cat TEXT;
  v_line_rev_coa UUID;
  v_line_cogs_coa UUID;
  v_rev_alloc JSONB := '{}'::jsonb;
  v_cogs_alloc JSONB := '{}'::jsonb;
  v_rev_missing BOOLEAN := FALSE;
  v_cogs_missing BOOLEAN := FALSE;
  v_lines_total NUMERIC;
  v_share NUMERIC;
  v_net NUMERIC;
  v_entry RECORD;
  v_alloc_sum NUMERIC;
  v_first_coa TEXT;
  v_amt NUMERIC;
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

  INSERT INTO pos_orders (org_id, outlet_id, cashier_id, status, subtotal, tax_amount, total_amount, payment_method, shift_id, client_request_id, discount_type, discount_value, discount_amount, rounding_amount)
  VALUES (p_org_id, p_outlet_id, p_cashier_id, 'completed', p_subtotal, p_tax_amount, p_total_amount, COALESCE(p_payment_summary, 'Unknown'), p_shift_id, p_client_request_id, p_order_discount_type, p_order_discount_value, p_order_discount_amount, COALESCE(p_rounding_amount, 0))
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

  SELECT coa_id INTO v_rounding_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'pos_rounding';
  IF v_rounding_coa_id IS NULL THEN
    v_rounding_coa_id := v_revenue_coa_id; -- unmapped: fold into revenue rather than block the sale
  END IF;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_lines_total FROM jsonb_to_recordset(p_lines) AS x(subtotal NUMERIC);

  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    item_id UUID,
    qty NUMERIC,
    unit_price NUMERIC,
    subtotal NUMERIC,
    discount_type TEXT,
    discount_value NUMERIC,
    discount_amount NUMERIC,
    note TEXT
  )
  LOOP
    INSERT INTO pos_order_lines (order_id, item_id, qty, unit_price, subtotal, discount_type, discount_value, discount_amount, note)
    VALUES (v_order_id, line.item_id, line.qty, line.unit_price, line.subtotal, line.discount_type, line.discount_value, COALESCE(line.discount_amount, 0), NULLIF(btrim(line.note), ''));

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

    -- Per-category accounts: the item's POS category picks its revenue (and
    -- optionally COGS) account; unmapped categories fall back to the
    -- 'finished' / default accounts resolved above. The order-level
    -- discount is spread across lines in proportion to their subtotal.
    SELECT COALESCE(NULLIF(btrim(pos_category), ''), 'Uncategorized') INTO v_cat FROM item_master WHERE id = line.item_id;
    v_line_rev_coa := NULL;
    v_line_cogs_coa := NULL;
    SELECT m.revenue_coa_id, m.cogs_coa_id INTO v_line_rev_coa, v_line_cogs_coa
    FROM pos_coa_mapping m
    WHERE m.org_id = p_org_id AND lower(m.pos_category) = lower(COALESCE(v_cat, 'Uncategorized'))
      AND (m.outlet_id = p_outlet_id OR m.outlet_id IS NULL)
    ORDER BY m.outlet_id NULLS LAST LIMIT 1;
    v_line_rev_coa := COALESCE(v_line_rev_coa, v_revenue_coa_id);
    v_line_cogs_coa := COALESCE(v_line_cogs_coa, v_cogs_coa_id);

    v_share := CASE WHEN v_lines_total > 0 THEN ROUND(COALESCE(p_order_discount_amount, 0) * line.subtotal / v_lines_total) ELSE 0 END;
    v_net := line.subtotal - v_share;
    IF v_line_rev_coa IS NULL THEN
      v_rev_missing := TRUE;
    ELSE
      v_rev_alloc := jsonb_set(v_rev_alloc, ARRAY[v_line_rev_coa::text], to_jsonb(COALESCE((v_rev_alloc->>(v_line_rev_coa::text))::numeric, 0) + v_net), true);
    END IF;
    IF v_line_cogs > 0 THEN
      IF v_line_cogs_coa IS NULL THEN
        v_cogs_missing := TRUE;
      ELSE
        v_cogs_alloc := jsonb_set(v_cogs_alloc, ARRAY[v_line_cogs_coa::text], to_jsonb(COALESCE((v_cogs_alloc->>(v_line_cogs_coa::text))::numeric, 0) + v_line_cogs), true);
      END IF;
    END IF;

    v_total_cogs := v_total_cogs + v_line_cogs;
  END LOOP;

  -- Payment rows are always written. The GL revenue/payment/tax lines are
  -- posted ALL-OR-NOTHING: previously each line was inserted independently,
  -- so an org missing (say) a revenue account still got its tax credit
  -- posted alone, and the deferred debit=credit constraint then rejected
  -- the whole sale at commit ("Unbalanced GL entries").
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

    IF v_payment_coa_id IS NULL THEN
      v_gl_complete := FALSE;
    ELSE
      v_debits := v_debits || jsonb_build_object('coa', v_payment_coa_id, 'amount', tender.amount, 'method', tender.method);
    END IF;
  END LOOP;

  IF v_rev_missing OR (p_tax_amount > 0 AND v_tax_coa_id IS NULL) OR (COALESCE(p_rounding_amount, 0) > 0 AND v_rounding_coa_id IS NULL) THEN
    v_gl_complete := FALSE;
  END IF;

  IF v_gl_complete THEN
    FOR v_debit IN SELECT value FROM jsonb_array_elements(v_debits)
    LOOP
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (p_outlet_id, CURRENT_DATE, (v_debit->>'coa')::uuid, (v_debit->>'amount')::numeric, 0, v_order_id, 'pos_order', 'POS Sale Payment (' || (v_debit->>'method') || ')');
    END LOOP;

    -- One credit per revenue account; any rounding drift versus p_subtotal
    -- goes onto the largest one so the journal stays exactly balanced.
    SELECT COALESCE(SUM(value::numeric), 0) INTO v_alloc_sum FROM jsonb_each_text(v_rev_alloc);
    SELECT key INTO v_first_coa FROM jsonb_each_text(v_rev_alloc) ORDER BY value::numeric DESC LIMIT 1;
    FOR v_entry IN SELECT key, value::numeric AS amount FROM jsonb_each_text(v_rev_alloc)
    LOOP
      v_amt := v_entry.amount;
      IF v_entry.key = v_first_coa THEN
        v_amt := v_amt + (p_subtotal - v_alloc_sum);
      END IF;
      IF v_amt <> 0 THEN
        INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
        VALUES (p_outlet_id, CURRENT_DATE, v_entry.key::uuid, 0, v_amt, v_order_id, 'pos_order', 'POS Sale Revenue');
      END IF;
    END LOOP;

    IF p_tax_amount > 0 THEN
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (p_outlet_id, CURRENT_DATE, v_tax_coa_id, 0, p_tax_amount, v_order_id, 'pos_order', 'POS Tax Collected');
    END IF;

    IF COALESCE(p_rounding_amount, 0) > 0 THEN
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (p_outlet_id, CURRENT_DATE, v_rounding_coa_id, 0, p_rounding_amount, v_order_id, 'pos_order', 'POS Rounding');
    END IF;
  ELSE
    v_gl_status := 'pending_mapping';
  END IF;

  IF v_total_cogs > 0 THEN
    IF NOT v_cogs_missing AND v_inventory_coa_id IS NOT NULL THEN
      FOR v_entry IN SELECT key, value::numeric AS amount FROM jsonb_each_text(v_cogs_alloc)
      LOOP
        INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
        VALUES (p_outlet_id, CURRENT_DATE, v_entry.key::uuid, v_entry.amount, 0, v_order_id, 'pos_order', 'POS COGS');
      END LOOP;

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
