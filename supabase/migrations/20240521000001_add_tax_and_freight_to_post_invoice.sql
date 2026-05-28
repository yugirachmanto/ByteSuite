-- Drop existing signatures of post_invoice and preview_journal to prevent conflicts
DROP FUNCTION IF EXISTS post_invoice(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS post_invoice(UUID, UUID, UUID, JSONB, UUID);
DROP FUNCTION IF EXISTS post_invoice(UUID, UUID, UUID, JSONB, UUID, NUMERIC, UUID, NUMERIC, UUID);
DROP FUNCTION IF EXISTS post_invoice(UUID, UUID, UUID, JSONB, UUID, NUMERIC, UUID, NUMERIC, UUID, BOOLEAN);

DROP FUNCTION IF EXISTS preview_journal(UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS preview_journal(UUID, UUID, JSONB, UUID);
DROP FUNCTION IF EXISTS preview_journal(UUID, UUID, JSONB, UUID, NUMERIC, UUID, NUMERIC, UUID);
DROP FUNCTION IF EXISTS preview_journal(UUID, UUID, JSONB, UUID, NUMERIC, UUID, NUMERIC, UUID, BOOLEAN);

-- ─── REVISED POST_INVOICE RPC ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION post_invoice(
  p_invoice_id UUID,
  p_outlet_id UUID,
  p_org_id UUID,
  p_lines JSONB,
  p_credit_coa_id UUID DEFAULT NULL,
  p_tax_amount NUMERIC DEFAULT 0,
  p_tax_coa_id UUID DEFAULT NULL,
  p_freight_amount NUMERIC DEFAULT 0,
  p_freight_coa_id UUID DEFAULT NULL,
  p_freight_distributed BOOLEAN DEFAULT FALSE
) RETURNS VOID AS $$
DECLARE
  line              RECORD;
  v_invoice_line_id UUID;
  v_batch_id        UUID;
  v_ap_coa_id       UUID;
  v_ppn_coa_id      UUID := p_tax_coa_id;
  v_freight_coa_id  UUID := p_freight_coa_id;
  v_credit_coa_type TEXT;
  v_total_amount    NUMERIC := 0;
BEGIN
  -- 1. Resolve credit COA (Accounts Payable or Hutang/Closing account)
  IF p_credit_coa_id IS NOT NULL THEN
    v_ap_coa_id := p_credit_coa_id;
  ELSE
    SELECT coa_id INTO v_ap_coa_id
      FROM default_coa_mappings
      WHERE org_id = p_org_id AND account_role = 'accounts_payable';
    
    IF v_ap_coa_id IS NULL THEN
      SELECT id INTO v_ap_coa_id FROM chart_of_accounts 
      WHERE org_id = p_org_id AND code = '2-1-001' LIMIT 1;
    END IF;
  END IF;

  IF v_ap_coa_id IS NULL THEN
    RAISE EXCEPTION 'Closing COA (credit account) not found or configured';
  END IF;

  -- Check the TYPE of the closing account to determine payment status
  SELECT type INTO v_credit_coa_type FROM chart_of_accounts WHERE id = v_ap_coa_id;

  -- 2. Resolve PPN (Tax) COA if tax is present
  IF COALESCE(p_tax_amount, 0) > 0 THEN
    IF v_ppn_coa_id IS NULL THEN
      SELECT coa_id INTO v_ppn_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'ppn_masukan';
      IF v_ppn_coa_id IS NULL THEN
        -- Robust fallback search for Asset-nature VAT receivable
        SELECT id INTO v_ppn_coa_id FROM chart_of_accounts 
        WHERE org_id = p_org_id 
          AND (name ILIKE '%ppn masukan%' OR name ILIKE '%vat in%' OR code = '1-1-008') 
        LIMIT 1;
      END IF;
    END IF;

    IF v_ppn_coa_id IS NULL THEN
      RAISE EXCEPTION 'PPN Masukan (Input VAT) account is not configured in your Accounting Settings. Silent fallback is blocked to prevent incorrect nature postings.';
    END IF;
  END IF;

  -- 3. Resolve Freight (Ongkir) COA if freight is present
  IF COALESCE(p_freight_amount, 0) > 0 THEN
    IF v_freight_coa_id IS NULL THEN
      SELECT coa_id INTO v_freight_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'freight_expense';
      IF v_freight_coa_id IS NULL THEN
        -- Robust fallback search for Expense-nature freight/ongkir account
        SELECT id INTO v_freight_coa_id FROM chart_of_accounts 
        WHERE org_id = p_org_id 
          AND (name ILIKE '%ongkir%' OR name ILIKE '%freight%' OR name ILIKE '%transport%' OR name ILIKE '%pengiriman%' OR code = '6-1-001') 
        LIMIT 1;
      END IF;
    END IF;

    IF v_freight_coa_id IS NULL THEN
      RAISE EXCEPTION 'Freight/Transport Expense account is not configured in your Accounting Settings.';
    END IF;
  END IF;

  -- Process each line
  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    item_id UUID, 
    qty DECIMAL, 
    unit_price DECIMAL, 
    total_price DECIMAL, 
    description TEXT,
    coa_id UUID,
    is_inventory BOOLEAN
  )
  LOOP
    v_total_amount := v_total_amount + line.total_price;

    -- 1. Create Invoice Line
    INSERT INTO invoice_lines (invoice_id, item_master_id, qty, unit_price, total, is_inventory, description, coa_id)
    VALUES (p_invoice_id, line.item_id, line.qty, line.unit_price, line.total_price, COALESCE(line.is_inventory, true), line.description, line.coa_id)
    RETURNING id INTO v_invoice_line_id;

    -- 2. Handle Inventory
    IF COALESCE(line.is_inventory, true) AND line.item_id IS NOT NULL THEN
      INSERT INTO stock_batches (outlet_id, item_id, purchase_date, original_qty, qty_remaining, unit_cost, invoice_line_id)
      VALUES (p_outlet_id, line.item_id, CURRENT_DATE, line.qty, line.qty, line.unit_price, v_invoice_line_id)
      RETURNING id INTO v_batch_id;

      INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
      VALUES (p_outlet_id, line.item_id, 'IN', line.qty, line.unit_price, line.total_price, 'invoice', p_invoice_id);

      INSERT INTO inventory_balance (outlet_id, item_id, qty_on_hand, inventory_value)
      VALUES (p_outlet_id, line.item_id, line.qty, line.total_price)
      ON CONFLICT (outlet_id, item_id)
      DO UPDATE SET 
        qty_on_hand = inventory_balance.qty_on_hand + EXCLUDED.qty_on_hand,
        inventory_value = inventory_balance.inventory_value + EXCLUDED.inventory_value,
        updated_at = NOW();
    END IF;

    -- 3. GL Entry (Debit for individual line items)
    IF line.coa_id IS NOT NULL THEN
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (p_outlet_id, CURRENT_DATE, line.coa_id, line.total_price, 0, p_invoice_id, 'invoice', COALESCE(line.description, 'Purchase'));
    END IF;
  END LOOP;

  -- 4. GL Entry (Debit for PPN / Input VAT if tax > 0)
  IF COALESCE(p_tax_amount, 0) > 0 AND v_ppn_coa_id IS NOT NULL THEN
    v_total_amount := v_total_amount + p_tax_amount;
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_ppn_coa_id, p_tax_amount, 0, p_invoice_id, 'invoice', 'PPN Masukan (Input Tax)');
  END IF;

  -- 5. GL Entry (Debit for Freight / Ongkir if freight > 0)
  IF COALESCE(p_freight_amount, 0) > 0 AND v_freight_coa_id IS NOT NULL THEN
    -- INVARIANT: if ongkir was distributed to line items (Option A),
    -- caller MUST pass p_freight_amount = 0 (unless there are direct expense items,
    -- in which case only the undistributed sisa is passed).
    -- Double-counting check:
    ASSERT (p_freight_amount = 0 OR NOT p_freight_distributed OR EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_lines) AS x(is_inventory BOOLEAN)
      WHERE NOT COALESCE(x.is_inventory, true)
    )), 'Freight amount double-counted: already in line items';

    v_total_amount := v_total_amount + p_freight_amount;
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_freight_coa_id, p_freight_amount, 0, p_invoice_id, 'invoice', 'Freight / Shipping Expense');
  END IF;

  -- 6. GL Entry (Credit Closing for Accounts Payable / Cash)
  IF v_ap_coa_id IS NOT NULL AND v_total_amount > 0 THEN
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_ap_coa_id, 0, v_total_amount, p_invoice_id, 'invoice', 'Purchase Invoice Closing Entry');
  END IF;

  -- 7. Update invoice status & payment status in the database
  IF v_credit_coa_type = 'asset' THEN
    UPDATE invoices SET status = 'posted', approved_at = NOW(), approved_by = auth.uid(),
      payment_status = 'paid', paid_amount = v_total_amount
    WHERE id = p_invoice_id;
  ELSE
    UPDATE invoices SET status = 'posted', approved_at = NOW(), approved_by = auth.uid(),
      payment_status = 'unpaid', paid_amount = 0
    WHERE id = p_invoice_id;
  END IF;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── REVISED PREVIEW_JOURNAL RPC ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION preview_journal(
  p_invoice_id UUID,
  p_org_id UUID,
  p_lines JSONB,
  p_credit_coa_id UUID DEFAULT NULL,
  p_tax_amount NUMERIC DEFAULT 0,
  p_tax_coa_id UUID DEFAULT NULL,
  p_freight_amount NUMERIC DEFAULT 0,
  p_freight_coa_id UUID DEFAULT NULL,
  p_freight_distributed BOOLEAN DEFAULT FALSE
) RETURNS JSONB AS $$
DECLARE
  line              RECORD;
  v_ap_coa_id       UUID;
  v_ppn_coa_id      UUID := p_tax_coa_id;
  v_freight_coa_id  UUID := p_freight_coa_id;
  v_total_amount    NUMERIC := 0;
  v_journal         JSONB := '[]'::JSONB;
  v_ap_coa_name     TEXT;
  v_ap_coa_code     TEXT;
  v_ppn_coa_name    TEXT;
  v_ppn_coa_code    TEXT;
  v_freight_coa_name TEXT;
  v_freight_coa_code TEXT;
  v_line_coa_name   TEXT;
  v_line_coa_code   TEXT;
BEGIN
  -- Resolve Credit COA
  IF p_credit_coa_id IS NOT NULL THEN
    v_ap_coa_id := p_credit_coa_id;
  ELSE
    SELECT coa_id INTO v_ap_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'accounts_payable';
    IF v_ap_coa_id IS NULL THEN
      SELECT id INTO v_ap_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code = '2-1-001' LIMIT 1;
    END IF;
  END IF;

  IF v_ap_coa_id IS NOT NULL THEN
    SELECT name, code INTO v_ap_coa_name, v_ap_coa_code FROM chart_of_accounts WHERE id = v_ap_coa_id;
  END IF;

  -- Process lines
  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    item_id UUID, 
    total_price DECIMAL, 
    description TEXT,
    coa_id UUID
  )
  LOOP
    v_total_amount := v_total_amount + line.total_price;

    -- Debit Line
    IF line.coa_id IS NOT NULL THEN
      SELECT name, code INTO v_line_coa_name, v_line_coa_code FROM chart_of_accounts WHERE id = line.coa_id;
      v_journal := v_journal || jsonb_build_object(
        'coa_id', line.coa_id,
        'coa_code', v_line_coa_code,
        'coa_name', v_line_coa_name,
        'debit', line.total_price,
        'credit', 0,
        'description', COALESCE(line.description, 'Purchase')
      );
    END IF;
  END LOOP;

  -- Resolve PPN COA if tax is present
  IF COALESCE(p_tax_amount, 0) > 0 THEN
    IF v_ppn_coa_id IS NULL THEN
      SELECT coa_id INTO v_ppn_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'ppn_masukan';
      IF v_ppn_coa_id IS NULL THEN
        SELECT id INTO v_ppn_coa_id FROM chart_of_accounts 
        WHERE org_id = p_org_id 
          AND (name ILIKE '%ppn masukan%' OR name ILIKE '%vat in%' OR code = '1-1-008') 
        LIMIT 1;
      END IF;
    END IF;

    IF v_ppn_coa_id IS NOT NULL THEN
      SELECT name, code INTO v_ppn_coa_name, v_ppn_coa_code FROM chart_of_accounts WHERE id = v_ppn_coa_id;
      v_total_amount := v_total_amount + p_tax_amount;
      v_journal := v_journal || jsonb_build_object(
        'coa_id', v_ppn_coa_id,
        'coa_code', v_ppn_coa_code,
        'coa_name', v_ppn_coa_name,
        'debit', p_tax_amount,
        'credit', 0,
        'description', 'PPN Masukan (Input Tax)'
      );
    ELSE
      -- On preview, show warning account code ERR so user knows setup is required
      v_journal := v_journal || jsonb_build_object(
        'coa_id', NULL,
        'coa_code', 'ERR',
        'coa_name', 'PPN Masukan account NOT CONFIGURED (Setup Required)',
        'debit', p_tax_amount,
        'credit', 0,
        'description', 'Setup required in Settings > Accounting'
      );
      v_total_amount := v_total_amount + p_tax_amount;
    END IF;
  END IF;

  -- Resolve Freight COA if freight is present
  IF COALESCE(p_freight_amount, 0) > 0 THEN
    IF v_freight_coa_id IS NULL THEN
      SELECT coa_id INTO v_freight_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'freight_expense';
      IF v_freight_coa_id IS NULL THEN
        SELECT id INTO v_freight_coa_id FROM chart_of_accounts 
        WHERE org_id = p_org_id 
          AND (name ILIKE '%ongkir%' OR name ILIKE '%freight%' OR name ILIKE '%transport%' OR name ILIKE '%pengiriman%' OR code = '6-1-001') 
        LIMIT 1;
      END IF;
    END IF;

    -- Double-counting check:
    ASSERT (p_freight_amount = 0 OR NOT p_freight_distributed OR EXISTS (
      SELECT 1 FROM jsonb_to_recordset(p_lines) AS x(is_inventory BOOLEAN)
      WHERE NOT COALESCE(x.is_inventory, true)
    )), 'Freight amount double-counted: already in line items';

    IF v_freight_coa_id IS NOT NULL THEN
      SELECT name, code INTO v_freight_coa_name, v_freight_coa_code FROM chart_of_accounts WHERE id = v_freight_coa_id;
      v_total_amount := v_total_amount + p_freight_amount;
      v_journal := v_journal || jsonb_build_object(
        'coa_id', v_freight_coa_id,
        'coa_code', v_freight_coa_code,
        'coa_name', v_freight_coa_name,
        'debit', p_freight_amount,
        'credit', 0,
        'description', 'Freight / Shipping Expense'
      );
    ELSE
      -- On preview, show warning account code ERR so user knows setup is required
      v_journal := v_journal || jsonb_build_object(
        'coa_id', NULL,
        'coa_code', 'ERR',
        'coa_name', 'Freight account NOT CONFIGURED (Setup Required)',
        'debit', p_freight_amount,
        'credit', 0,
        'description', 'Setup required in Settings > Accounting'
      );
      v_total_amount := v_total_amount + p_freight_amount;
    END IF;
  END IF;

  -- Credit Closing Entry
  IF v_ap_coa_id IS NOT NULL AND v_total_amount > 0 THEN
    v_journal := v_journal || jsonb_build_object(
      'coa_id', v_ap_coa_id,
      'coa_code', v_ap_coa_code,
      'coa_name', v_ap_coa_name,
      'debit', 0,
      'credit', v_total_amount,
      'description', 'Purchase Invoice Closing Entry'
    );
  END IF;

  RETURN v_journal;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
