-- import_beginning_balance() resolved its Inventory/Equity accounts by
-- guessing fixed codes ('1-3-00-000', '1-1-001', '3-1-00-000', '3-1-001').
-- For an org with a real, fuller COA (confirmed live: '1-3-00-000' is a
-- HEADER account, "INVENTORIES", not a postable leaf), the guessed code
-- matches a header and the GL insert is rejected ("is a header account and
-- cannot receive GL entries"), so the whole import fails at the very last
-- step after everything else already validated. This revision instead
-- prefers a postable (is_header = false) account whose name suggests the
-- right purpose, and falls back to the first postable account of that
-- type — never a header — so the import can't be blocked by COA structure
-- it doesn't recognize.
CREATE OR REPLACE FUNCTION import_beginning_balance(
  p_org_id UUID,
  p_outlet_id UUID,
  p_items JSONB -- [{item_id, qty, unit_cost}]
) RETURNS INT AS $$
DECLARE
  v_outlet_org      UUID;
  item              RECORD;
  v_row_value       NUMERIC;
  v_total_value     NUMERIC := 0;
  v_count           INT := 0;
  v_inventory_coa   UUID;
  v_equity_coa      UUID;
BEGIN
  SELECT org_id INTO v_outlet_org FROM outlets WHERE id = p_outlet_id;
  IF v_outlet_org IS NULL OR v_outlet_org <> p_org_id THEN
    RAISE EXCEPTION 'Outlet does not belong to your organization';
  END IF;

  -- Idempotency: replace any prior beginning-balance import for this outlet
  -- rather than accumulating duplicate history on re-run.
  DELETE FROM stock_ledger WHERE outlet_id = p_outlet_id AND txn_type = 'BEGINNING_BALANCE';
  DELETE FROM gl_entries WHERE outlet_id = p_outlet_id AND reference_type = 'beginning_balance_import';

  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(item_id UUID, qty NUMERIC, unit_cost NUMERIC)
  LOOP
    IF item.item_id IS NULL OR item.qty IS NULL OR item.qty <= 0 THEN
      CONTINUE;
    END IF;

    v_row_value := ROUND(item.qty * COALESCE(item.unit_cost, 0));

    INSERT INTO inventory_balance (outlet_id, item_id, qty_on_hand, inventory_value)
    VALUES (p_outlet_id, item.item_id, item.qty, v_row_value)
    ON CONFLICT (outlet_id, item_id)
    DO UPDATE SET
      qty_on_hand = EXCLUDED.qty_on_hand,
      inventory_value = EXCLUDED.inventory_value,
      updated_at = NOW();

    INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
    VALUES (p_outlet_id, item.item_id, 'BEGINNING_BALANCE', item.qty, COALESCE(item.unit_cost, 0), v_row_value, 'import', NULL);

    v_total_value := v_total_value + v_row_value;
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No valid items found to import';
  END IF;

  IF v_total_value > 0 THEN
    -- Prefer a postable account whose name suggests inventory; otherwise
    -- fall back to the first postable asset account. Never match a header.
    SELECT id INTO v_inventory_coa FROM chart_of_accounts
    WHERE org_id = p_org_id AND type = 'asset' AND is_header = false AND name ILIKE '%inv%'
    ORDER BY code LIMIT 1;
    IF v_inventory_coa IS NULL THEN
      SELECT id INTO v_inventory_coa FROM chart_of_accounts
      WHERE org_id = p_org_id AND type = 'asset' AND is_header = false
      ORDER BY code LIMIT 1;
    END IF;

    SELECT id INTO v_equity_coa FROM chart_of_accounts
    WHERE org_id = p_org_id AND type = 'equity' AND is_header = false
      AND (name ILIKE '%capital%' OR name ILIKE '%equity%' OR name ILIKE '%balance%')
    ORDER BY code LIMIT 1;
    IF v_equity_coa IS NULL THEN
      SELECT id INTO v_equity_coa FROM chart_of_accounts
      WHERE org_id = p_org_id AND type = 'equity' AND is_header = false
      ORDER BY code LIMIT 1;
    END IF;

    IF v_inventory_coa IS NOT NULL AND v_equity_coa IS NOT NULL THEN
      INSERT INTO gl_entries (org_id, outlet_id, entry_date, coa_id, debit, credit, reference_type, reference_id, description)
      VALUES (p_org_id, p_outlet_id, CURRENT_DATE, v_inventory_coa, v_total_value, 0, 'beginning_balance_import', p_outlet_id, 'Beginning Inventory Import');

      INSERT INTO gl_entries (org_id, outlet_id, entry_date, coa_id, debit, credit, reference_type, reference_id, description)
      VALUES (p_org_id, p_outlet_id, CURRENT_DATE, v_equity_coa, 0, v_total_value, 'beginning_balance_import', p_outlet_id, 'Opening Balance Equity');
    END IF;
  END IF;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
