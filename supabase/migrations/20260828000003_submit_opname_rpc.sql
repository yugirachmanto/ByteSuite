-- Convert opname (physical stock count) submission to a single atomic RPC.
--
-- CLAUDE.md rule 4 requires opname submissions to be atomic; the previous
-- client-side implementation (src/app/(dashboard)/opname/new/page.tsx)
-- issued a log insert followed by a per-item loop of separate
-- update/insert/journal calls with no transaction, so a failure partway
-- through left opname_log rows with no matching inventory_balance/
-- stock_ledger/GL updates. It also tried to write its negative-variance GL
-- journal into gl_journals/gl_journal_lines, tables that do not exist in
-- this database — so that accounting entry silently never happened, with no
-- error surfaced (same dead-code issue as the beginning-balance import).
--
-- The variance-costing formula itself (weighted average of current book
-- value) is unchanged — it's a reasonable basis for a count *correction*,
-- distinct from FIFO issuance cost, and not what this fix targets.

CREATE OR REPLACE FUNCTION submit_opname(
  p_outlet_id UUID,
  p_org_id UUID,
  p_opname_date DATE,
  p_items JSONB -- [{item_id, item_name, item_category, system_qty, physical_qty, inventory_value, variance_reason}]
) RETURNS INT AS $$
DECLARE
  item                RECORD;
  v_log_id            UUID;
  v_variance          NUMERIC;
  v_avg_cost          NUMERIC;
  v_value_adjustment  NUMERIC;
  v_new_inventory_value NUMERIC;
  v_expense_coa_code  TEXT;
  v_inventory_coa_id  UUID;
  v_expense_coa_id    UUID;
  v_count             INT := 0;
BEGIN
  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    item_id UUID, item_name TEXT, item_category TEXT,
    system_qty NUMERIC, physical_qty NUMERIC, inventory_value NUMERIC, variance_reason TEXT
  )
  LOOP
    v_count := v_count + 1;

    INSERT INTO opname_log (outlet_id, opname_date, item_id, system_qty, physical_qty, variance_reason, created_by)
    VALUES (p_outlet_id, p_opname_date, item.item_id, item.system_qty, item.physical_qty, item.variance_reason, auth.uid())
    RETURNING id INTO v_log_id;

    v_variance := item.physical_qty - item.system_qty;
    IF v_variance = 0 THEN
      CONTINUE;
    END IF;

    v_avg_cost := CASE WHEN item.system_qty > 0 THEN item.inventory_value / item.system_qty ELSE 0 END;
    v_value_adjustment := ROUND(v_variance * v_avg_cost);
    v_new_inventory_value := GREATEST(0, item.inventory_value + v_value_adjustment);

    UPDATE opname_log SET variance_value = v_value_adjustment WHERE id = v_log_id;

    UPDATE inventory_balance
    SET qty_on_hand = item.physical_qty,
        inventory_value = v_new_inventory_value,
        updated_at = NOW()
    WHERE outlet_id = p_outlet_id AND item_id = item.item_id;

    INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
    VALUES (p_outlet_id, item.item_id, 'OPNAME_ADJ', v_variance, ROUND(v_avg_cost), ABS(v_value_adjustment), 'opname', v_log_id);

    -- Negative variance (loss) with a stated reason: post a GL entry.
    IF v_variance < 0 AND item.variance_reason IS NOT NULL AND ABS(v_value_adjustment) > 0 THEN
      v_expense_coa_code := '5-3-00-050'; -- Default: Cost of Variance
      IF item.variance_reason IN ('spoilage', 'waste') AND item.item_category IN ('raw', 'wip', 'finished') THEN
        v_expense_coa_code := '5-1-10-030'; -- Cost of Food Spoilage/Waste
      END IF;

      SELECT id INTO v_inventory_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code = '1-3-00-000' LIMIT 1;
      SELECT id INTO v_expense_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code = v_expense_coa_code LIMIT 1;

      IF v_inventory_coa_id IS NOT NULL AND v_expense_coa_id IS NOT NULL THEN
        INSERT INTO gl_entries (org_id, outlet_id, entry_date, coa_id, debit, credit, reference_type, reference_id, description)
        VALUES (p_org_id, p_outlet_id, p_opname_date, v_expense_coa_id, ABS(v_value_adjustment), 0, 'opname', v_log_id, 'Spoilage/Waste Expense - ' || COALESCE(item.item_name, ''));

        INSERT INTO gl_entries (org_id, outlet_id, entry_date, coa_id, debit, credit, reference_type, reference_id, description)
        VALUES (p_org_id, p_outlet_id, p_opname_date, v_inventory_coa_id, 0, ABS(v_value_adjustment), 'opname', v_log_id, 'Inventory Asset Reduction - ' || COALESCE(item.item_name, ''));
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
