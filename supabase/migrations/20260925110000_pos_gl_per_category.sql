-- Journal the POS sale per product category.
-- The item's POS category (Settings > POS Mapping > Category Mappings) now
-- decides which revenue (and optionally COGS) account it is credited to /
-- debited from. Previously every sale was posted to one account resolved
-- from a mapping literally named 'finished', so per-category mappings had no
-- effect. Unmapped categories still fall back to that 'finished'/default
-- account. Order-level discounts are spread across lines proportionally.
-- Signature is unchanged (CREATE OR REPLACE).

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
    discount_amount NUMERIC
  )
  LOOP
    INSERT INTO pos_order_lines (order_id, item_id, qty, unit_price, subtotal, discount_type, discount_value, discount_amount)
    VALUES (v_order_id, line.item_id, line.qty, line.unit_price, line.subtotal, line.discount_type, line.discount_value, COALESCE(line.discount_amount, 0));

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
  v_ok BOOLEAN;
  v_rounding_coa_id UUID;
  v_debits JSONB;
  v_debit JSONB;
  pay RECORD;
  l RECORD;
  v_cat TEXT;
  v_line_rev_coa UUID;
  v_line_cogs_coa UUID;
  v_rev_alloc JSONB;
  v_cogs_alloc JSONB;
  v_rev_missing BOOLEAN;
  v_cogs_missing BOOLEAN;
  v_lines_total NUMERIC;
  v_share NUMERIC;
  v_net NUMERIC;
  v_entry RECORD;
  v_alloc_sum NUMERIC;
  v_first_coa TEXT;
  v_rev_total NUMERIC;
  v_amt NUMERIC;
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

    SELECT coa_id INTO v_rounding_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'pos_rounding';
    IF v_rounding_coa_id IS NULL THEN
      v_rounding_coa_id := v_revenue_coa_id;
    END IF;

    SELECT COALESCE(SUM(total_value), 0) INTO v_total_cogs
    FROM stock_ledger WHERE reference_type = 'pos_order' AND reference_id = ord.id AND txn_type = 'OUT';

    -- Rebuild the per-category revenue split from the stored order lines
    -- (order-level discount spread proportionally, as at checkout). COGS
    -- is only stored as one total per order, so it is split across the
    -- categories in proportion to their revenue.
    v_rev_alloc := '{}'::jsonb;
    v_cogs_alloc := '{}'::jsonb;
    v_rev_missing := FALSE;
    v_cogs_missing := FALSE;
    SELECT COALESCE(SUM(subtotal), 0) INTO v_lines_total FROM pos_order_lines WHERE order_id = ord.id;
    FOR l IN
      SELECT ol.subtotal, COALESCE(NULLIF(btrim(im.pos_category), ''), 'Uncategorized') AS cat
      FROM pos_order_lines ol LEFT JOIN item_master im ON im.id = ol.item_id
      WHERE ol.order_id = ord.id
    LOOP
      v_line_rev_coa := NULL;
      v_line_cogs_coa := NULL;
      SELECT m.revenue_coa_id, m.cogs_coa_id INTO v_line_rev_coa, v_line_cogs_coa
      FROM pos_coa_mapping m
      WHERE m.org_id = p_org_id AND lower(m.pos_category) = lower(l.cat)
        AND (m.outlet_id = ord.outlet_id OR m.outlet_id IS NULL)
      ORDER BY m.outlet_id NULLS LAST LIMIT 1;
      v_line_rev_coa := COALESCE(v_line_rev_coa, v_revenue_coa_id);
      v_line_cogs_coa := COALESCE(v_line_cogs_coa, v_cogs_coa_id);
      v_share := CASE WHEN v_lines_total > 0 THEN ROUND(COALESCE(ord.discount_amount, 0) * l.subtotal / v_lines_total) ELSE 0 END;
      v_net := l.subtotal - v_share;
      IF v_line_rev_coa IS NULL THEN
        v_rev_missing := TRUE;
      ELSE
        v_rev_alloc := jsonb_set(v_rev_alloc, ARRAY[v_line_rev_coa::text], to_jsonb(COALESCE((v_rev_alloc->>(v_line_rev_coa::text))::numeric, 0) + v_net), true);
        IF v_total_cogs > 0 THEN
          IF v_line_cogs_coa IS NULL THEN
            v_cogs_missing := TRUE;
          ELSE
            v_cogs_alloc := jsonb_set(v_cogs_alloc, ARRAY[v_line_cogs_coa::text], to_jsonb(COALESCE((v_cogs_alloc->>(v_line_cogs_coa::text))::numeric, 0) + v_net), true);
          END IF;
        END IF;
      END IF;
    END LOOP;
    -- v_cogs_alloc currently holds revenue weights; scale to the COGS total.
    SELECT COALESCE(SUM(value::numeric), 0) INTO v_rev_total FROM jsonb_each_text(v_cogs_alloc);
    IF v_total_cogs > 0 AND v_rev_total > 0 THEN
      SELECT jsonb_object_agg(key, ROUND(value::numeric / v_rev_total * v_total_cogs, 2)) INTO v_cogs_alloc FROM jsonb_each_text(v_cogs_alloc);
      SELECT COALESCE(SUM(value::numeric), 0) INTO v_alloc_sum FROM jsonb_each_text(v_cogs_alloc);
      SELECT key INTO v_first_coa FROM jsonb_each_text(v_cogs_alloc) ORDER BY value::numeric DESC LIMIT 1;
      v_cogs_alloc := jsonb_set(v_cogs_alloc, ARRAY[v_first_coa], to_jsonb((v_cogs_alloc->>v_first_coa)::numeric + (v_total_cogs - v_alloc_sum)), true);
    END IF;

    -- All-or-nothing, mirroring process_pos_order: resolve every tender's
    -- account first, and only post payment/revenue/tax together.
    v_ok := TRUE;
    v_debits := '[]'::jsonb;
    FOR pay IN
      SELECT payment_method AS method, amount FROM pos_order_payments WHERE order_id = ord.id
      UNION ALL
      SELECT ord.payment_method, ord.total_amount
      WHERE NOT EXISTS (SELECT 1 FROM pos_order_payments WHERE order_id = ord.id)
    LOOP
      v_payment_coa_id := NULL;
      SELECT coa_id INTO v_payment_coa_id FROM pos_payment_method_mapping
      WHERE org_id = p_org_id AND payment_method = pay.method AND (outlet_id = ord.outlet_id OR outlet_id IS NULL)
      ORDER BY outlet_id NULLS LAST LIMIT 1;
      IF v_payment_coa_id IS NULL THEN
        SELECT id INTO v_payment_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code LIKE '1-1%' AND is_header = false LIMIT 1;
      END IF;
      IF v_payment_coa_id IS NULL THEN
        v_ok := FALSE;
      ELSE
        v_debits := v_debits || jsonb_build_object('coa', v_payment_coa_id, 'amount', pay.amount, 'method', pay.method);
      END IF;
    END LOOP;

    IF v_rev_missing OR (ord.tax_amount > 0 AND v_tax_coa_id IS NULL) OR (ord.rounding_amount > 0 AND v_rounding_coa_id IS NULL) THEN
      v_ok := FALSE;
    END IF;

    IF v_ok THEN
      IF NOT EXISTS (SELECT 1 FROM gl_entries WHERE reference_id = ord.id AND description LIKE 'POS Sale Revenue%') THEN
        FOR v_debit IN SELECT value FROM jsonb_array_elements(v_debits)
        LOOP
          INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
          VALUES (ord.outlet_id, CURRENT_DATE, (v_debit->>'coa')::uuid, (v_debit->>'amount')::numeric, 0, ord.id, 'pos_order', 'POS Sale Payment (reposted)');
        END LOOP;
        SELECT COALESCE(SUM(value::numeric), 0) INTO v_alloc_sum FROM jsonb_each_text(v_rev_alloc);
        SELECT key INTO v_first_coa FROM jsonb_each_text(v_rev_alloc) ORDER BY value::numeric DESC LIMIT 1;
        FOR v_entry IN SELECT key, value::numeric AS amount FROM jsonb_each_text(v_rev_alloc)
        LOOP
          v_amt := v_entry.amount;
          IF v_entry.key = v_first_coa THEN
            v_amt := v_amt + (ord.subtotal - v_alloc_sum);
          END IF;
          IF v_amt <> 0 THEN
            INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
            VALUES (ord.outlet_id, CURRENT_DATE, v_entry.key::uuid, 0, v_amt, ord.id, 'pos_order', 'POS Sale Revenue (reposted)');
          END IF;
        END LOOP;
        IF ord.tax_amount > 0 THEN
          INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
          VALUES (ord.outlet_id, CURRENT_DATE, v_tax_coa_id, 0, ord.tax_amount, ord.id, 'pos_order', 'POS Tax Collected (reposted)');
        END IF;
        IF ord.rounding_amount > 0 THEN
          INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
          VALUES (ord.outlet_id, CURRENT_DATE, v_rounding_coa_id, 0, ord.rounding_amount, ord.id, 'pos_order', 'POS Rounding (reposted)');
        END IF;
      END IF;
    ELSE
      v_gl_status := 'pending_mapping';
    END IF;

    IF v_total_cogs > 0 THEN
      IF NOT v_cogs_missing AND v_inventory_coa_id IS NOT NULL AND v_rev_total > 0 THEN
        IF NOT EXISTS (SELECT 1 FROM gl_entries WHERE reference_id = ord.id AND description LIKE 'POS COGS%') THEN
          FOR v_entry IN SELECT key, value::numeric AS amount FROM jsonb_each_text(v_cogs_alloc)
          LOOP
            INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
            VALUES (ord.outlet_id, CURRENT_DATE, v_entry.key::uuid, v_entry.amount, 0, ord.id, 'pos_order', 'POS COGS (reposted)');
          END LOOP;
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
