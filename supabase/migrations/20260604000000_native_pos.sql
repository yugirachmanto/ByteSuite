-- Migration: Native POS Tables & RPC

-- 1. pos_orders table
CREATE TABLE IF NOT EXISTS pos_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) NOT NULL,
  outlet_id UUID REFERENCES outlets(id) NOT NULL,
  cashier_id UUID REFERENCES auth.users(id),
  status TEXT CHECK (status IN ('completed', 'voided')) DEFAULT 'completed',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pos_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org access pos_orders" ON pos_orders FOR ALL 
  USING (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()));

-- 2. pos_order_lines table
CREATE TABLE IF NOT EXISTS pos_order_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES pos_orders(id) ON DELETE CASCADE NOT NULL,
  item_id UUID REFERENCES item_master(id) NOT NULL,
  qty NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  subtotal NUMERIC NOT NULL
);

ALTER TABLE pos_order_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org access pos_order_lines" ON pos_order_lines FOR ALL 
  USING (order_id IN (SELECT id FROM pos_orders WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())));

-- 3. RPC to process POS order
CREATE OR REPLACE FUNCTION process_pos_order(
  p_org_id UUID,
  p_outlet_id UUID,
  p_cashier_id UUID,
  p_payment_method TEXT,
  p_subtotal NUMERIC,
  p_tax_amount NUMERIC,
  p_total_amount NUMERIC,
  p_lines JSONB
) RETURNS UUID AS $$
DECLARE
  v_order_id UUID;
  line RECORD;
  v_revenue_coa_id UUID;
  v_cogs_coa_id UUID;
  v_inventory_coa_id UUID;
  v_payment_coa_id UUID;
  v_avg_cost NUMERIC := 0;
  v_total_cogs NUMERIC := 0;
BEGIN
  -- Insert order
  INSERT INTO pos_orders (org_id, outlet_id, cashier_id, status, subtotal, tax_amount, total_amount, payment_method)
  VALUES (p_org_id, p_outlet_id, p_cashier_id, 'completed', p_subtotal, p_tax_amount, p_total_amount, p_payment_method)
  RETURNING id INTO v_order_id;

  -- Resolve Payment COA
  SELECT coa_id INTO v_payment_coa_id FROM pos_payment_method_mapping 
  WHERE org_id = p_org_id AND payment_method = p_payment_method AND (outlet_id = p_outlet_id OR outlet_id IS NULL)
  ORDER BY outlet_id NULLS LAST LIMIT 1;

  -- Fallback Payment COA
  IF v_payment_coa_id IS NULL THEN
    SELECT id INTO v_payment_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code LIKE '1-1%' LIMIT 1;
  END IF;

  -- Resolve Revenue COA (using 'finished' category)
  SELECT revenue_coa_id, cogs_coa_id INTO v_revenue_coa_id, v_cogs_coa_id FROM pos_coa_mapping 
  WHERE org_id = p_org_id AND pos_category = 'finished' AND (outlet_id = p_outlet_id OR outlet_id IS NULL)
  ORDER BY outlet_id NULLS LAST LIMIT 1;

  -- Fallbacks for Revenue and COGS COA
  IF v_revenue_coa_id IS NULL THEN
    SELECT id INTO v_revenue_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code LIKE '4-%' LIMIT 1;
  END IF;
  IF v_cogs_coa_id IS NULL THEN
    SELECT id INTO v_cogs_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code LIKE '5-%' LIMIT 1;
  END IF;
  
  -- Resolve Inventory COA (global fallback for simplicity)
  SELECT id INTO v_inventory_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code LIKE '1-3%' LIMIT 1;

  -- Process Lines
  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    item_id UUID, 
    qty NUMERIC, 
    unit_price NUMERIC, 
    subtotal NUMERIC
  )
  LOOP
    -- Insert line
    INSERT INTO pos_order_lines (order_id, item_id, qty, unit_price, subtotal)
    VALUES (v_order_id, line.item_id, line.qty, line.unit_price, line.subtotal);

    -- Find avg cost for COGS (simple approximation using inventory_balance values)
    SELECT CASE WHEN qty_on_hand > 0 THEN inventory_value / qty_on_hand ELSE 0 END INTO v_avg_cost 
    FROM inventory_balance WHERE outlet_id = p_outlet_id AND item_id = line.item_id;
    
    v_avg_cost := COALESCE(v_avg_cost, 0);
    v_total_cogs := v_total_cogs + (v_avg_cost * line.qty);

    -- Stock Ledger (OUT)
    INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id, notes)
    VALUES (p_outlet_id, line.item_id, 'OUT', line.qty, v_avg_cost, v_avg_cost * line.qty, 'pos_order', v_order_id, 'POS Sale');

    -- Update Inventory Balance
    INSERT INTO inventory_balance (outlet_id, item_id, qty_on_hand, inventory_value)
    VALUES (p_outlet_id, line.item_id, -line.qty, -(v_avg_cost * line.qty))
    ON CONFLICT (outlet_id, item_id)
    DO UPDATE SET 
      qty_on_hand = inventory_balance.qty_on_hand + EXCLUDED.qty_on_hand,
      inventory_value = inventory_balance.inventory_value + EXCLUDED.inventory_value,
      updated_at = NOW();
  END LOOP;

  -- GL Entries
  -- 1. Debit Cash/Payment
  IF v_payment_coa_id IS NOT NULL THEN
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_payment_coa_id, p_total_amount, 0, v_order_id, 'pos_order', 'POS Sale Payment');
  END IF;

  -- 2. Credit Revenue
  IF v_revenue_coa_id IS NOT NULL THEN
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_revenue_coa_id, 0, p_subtotal, v_order_id, 'pos_order', 'POS Sale Revenue');
  END IF;

  -- 3. Credit Tax Liability (if any)
  IF p_tax_amount > 0 THEN
    -- Look up tax COA (fallback to 2-1-002 or similar)
    DECLARE v_tax_coa_id UUID;
    BEGIN
      SELECT id INTO v_tax_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND name ILIKE '%tax%' OR name ILIKE '%ppn%' AND type='liability' LIMIT 1;
      IF v_tax_coa_id IS NOT NULL THEN
        INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
        VALUES (p_outlet_id, CURRENT_DATE, v_tax_coa_id, 0, p_tax_amount, v_order_id, 'pos_order', 'POS Tax Collected');
      END IF;
    END;
  END IF;

  -- 4. COGS & Inventory entries (if tracked)
  IF v_cogs_coa_id IS NOT NULL AND v_inventory_coa_id IS NOT NULL AND v_total_cogs > 0 THEN
    -- Debit COGS
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_cogs_coa_id, v_total_cogs, 0, v_order_id, 'pos_order', 'POS COGS');
    -- Credit Inventory
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_inventory_coa_id, 0, v_total_cogs, v_order_id, 'pos_order', 'POS Inventory Deduction');
  END IF;

  RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
