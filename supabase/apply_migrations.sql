-- ===========================================================================
-- BYSUITE ERP — POST-SCHEMA MIGRATIONS
-- Run this AFTER schema.sql in the Supabase SQL Editor.
-- This applies all RLS policies, RPCs, extra tables, and fixes.
-- Safe to re-run (all uses IF NOT EXISTS / CREATE OR REPLACE / DROP IF EXISTS).
-- ===========================================================================


-- ─── SECTION 1: ENABLE RLS ON ALL TABLES ───────────────────────────────────
ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets              ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_master          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices             ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_batches        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_balance    ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE opname_log           ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_entries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integrations    ENABLE ROW LEVEL SECURITY;


-- ─── SECTION 2: STORAGE BUCKET ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'invoices', 'invoices', true, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/jpg']
)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Authenticated users can upload invoices" ON storage.objects;
CREATE POLICY "Authenticated users can upload invoices"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoices');

DROP POLICY IF EXISTS "Authenticated users can read invoices" ON storage.objects;
CREATE POLICY "Authenticated users can read invoices"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'invoices');

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'invoices');

DROP POLICY IF EXISTS "Authenticated Upload" ON storage.objects;
CREATE POLICY "Authenticated Upload"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'invoices' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated Manage" ON storage.objects;
CREATE POLICY "Authenticated Manage"
  ON storage.objects FOR ALL
  USING (bucket_id = 'invoices' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Authenticated users can delete invoices" ON storage.objects;
CREATE POLICY "Authenticated users can delete invoices"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'invoices');


-- ─── SECTION 3: ORGANIZATIONS & OUTLETS RLS ────────────────────────────────
DROP POLICY IF EXISTS "Users can access their org data"    ON organizations;
DROP POLICY IF EXISTS "Users can access their outlet data" ON outlets;

CREATE POLICY "Users can access their org data"
  ON organizations FOR ALL
  USING (id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));

CREATE POLICY "Users can access their outlet data"
  ON outlets FOR ALL
  USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));


-- ─── SECTION 4: USER_PROFILES RLS ──────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage own profile" ON user_profiles;
CREATE POLICY "Users can manage own profile"
  ON user_profiles FOR ALL
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());


-- ─── SECTION 5: CHART OF ACCOUNTS RLS ──────────────────────────────────────
DROP POLICY IF EXISTS "Org access" ON chart_of_accounts;
CREATE POLICY "Org access"
  ON chart_of_accounts FOR ALL
  USING  (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));


-- ─── SECTION 6: ITEM_MASTER RLS ────────────────────────────────────────────
DROP POLICY IF EXISTS "Org access" ON item_master;
CREATE POLICY "Org access"
  ON item_master FOR ALL
  USING  (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));


-- ─── SECTION 7: BOM RLS ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Org access"            ON bom;
DROP POLICY IF EXISTS "bom_management_policy" ON bom;
CREATE POLICY "bom_management_policy"
  ON bom FOR ALL TO authenticated
  USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));


-- ─── SECTION 8: INVOICES & INVOICE_LINES RLS ───────────────────────────────
DROP POLICY IF EXISTS "Outlet access" ON invoices;
CREATE POLICY "Outlet access"
  ON invoices FOR ALL
  USING (
    outlet_id IN (
      SELECT id FROM outlets
      WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM outlets
      WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Outlet access" ON invoice_lines;
CREATE POLICY "Outlet access"
  ON invoice_lines FOR ALL
  USING (
    invoice_id IN (
      SELECT id FROM invoices WHERE outlet_id IN (
        SELECT id FROM outlets
        WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
      )
    )
  );


-- ─── SECTION 9: INVENTORY TABLES RLS ───────────────────────────────────────
DROP POLICY IF EXISTS "Outlet access" ON stock_ledger;
CREATE POLICY "Outlet access"
  ON stock_ledger FOR ALL
  USING (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())))
  WITH CHECK (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Outlet access" ON stock_batches;
CREATE POLICY "Outlet access"
  ON stock_batches FOR ALL
  USING (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())))
  WITH CHECK (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Outlet access" ON inventory_balance;
CREATE POLICY "Outlet access"
  ON inventory_balance FOR ALL
  USING (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())))
  WITH CHECK (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Outlet access" ON production_log;
CREATE POLICY "Outlet access"
  ON production_log FOR ALL
  USING (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())))
  WITH CHECK (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())));

DROP POLICY IF EXISTS "Outlet access" ON opname_log;
CREATE POLICY "Outlet access"
  ON opname_log FOR ALL
  USING (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())))
  WITH CHECK (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())));


-- ─── SECTION 10: GL ENTRIES RLS ────────────────────────────────────────────
DROP POLICY IF EXISTS "Outlet access"    ON gl_entries;
DROP POLICY IF EXISTS "Org access for GL" ON gl_entries;
CREATE POLICY "Org access for GL"
  ON gl_entries FOR ALL
  USING (
    outlet_id IN (
      SELECT o.id FROM outlets o
      JOIN user_profiles up ON up.org_id = o.org_id
      WHERE up.id = auth.uid()
    )
  );


-- ─── SECTION 11: USER_INTEGRATIONS RLS ─────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage own integrations"        ON user_integrations;
DROP POLICY IF EXISTS "Users can manage their own integrations"  ON user_integrations;
CREATE POLICY "Users can manage own integrations"
  ON user_integrations FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());


-- ─── SECTION 12: EXTRA COLUMNS ON INVOICES ─────────────────────────────────
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT now();
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount       NUMERIC DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid', 'partial', 'paid'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_amount    NUMERIC DEFAULT 0;


-- ─── SECTION 13: EXTRA TABLES ──────────────────────────────────────────────

-- default_coa_mappings
CREATE TABLE IF NOT EXISTS default_coa_mappings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id),
  account_role text NOT NULL,
  coa_id       uuid NOT NULL REFERENCES chart_of_accounts(id),
  UNIQUE (org_id, account_role)
);
ALTER TABLE default_coa_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org access" ON default_coa_mappings;
CREATE POLICY "Org access" ON default_coa_mappings FOR ALL
  USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));

-- pph_rules
CREATE TABLE IF NOT EXISTS pph_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid REFERENCES organizations(id),
  pasal           text NOT NULL,
  service_keyword text[],
  rate_percent    numeric NOT NULL,
  coa_role        text NOT NULL
);
ALTER TABLE pph_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org access" ON pph_rules;
CREATE POLICY "Org access" ON pph_rules FOR ALL
  USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()) OR org_id IS NULL);

-- ap_payments
CREATE TABLE IF NOT EXISTS ap_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES organizations(id),
  outlet_id    UUID NOT NULL REFERENCES outlets(id),
  invoice_id   UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount       NUMERIC NOT NULL,
  coa_id       UUID NOT NULL REFERENCES chart_of_accounts(id),
  reference_no TEXT,
  notes        TEXT,
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE ap_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org access" ON ap_payments;
CREATE POLICY "Org access" ON ap_payments FOR ALL
  USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));

-- product_prices
CREATE TABLE IF NOT EXISTS product_prices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id),
  outlet_id     UUID NOT NULL REFERENCES outlets(id),
  item_id       UUID NOT NULL REFERENCES item_master(id) ON DELETE CASCADE,
  selling_price NUMERIC NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (outlet_id, item_id)
);
ALTER TABLE product_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Org access" ON product_prices;
CREATE POLICY "Org access" ON product_prices FOR ALL
  USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));

-- user_integrations extra columns
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS credentials JSONB;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE user_integrations DROP CONSTRAINT IF EXISTS user_integrations_user_id_provider_key;
ALTER TABLE user_integrations ADD CONSTRAINT user_integrations_user_id_provider_key UNIQUE (user_id, provider);


-- ─── SECTION 14: REGISTER_NEW_ORG RPC ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.register_new_org(
  p_user_id     UUID,
  p_full_name   TEXT,
  p_org_name    TEXT,
  p_outlet_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id    UUID;
  v_outlet_id UUID;
BEGIN
  -- Guard: idempotent on retry
  IF EXISTS (SELECT 1 FROM user_profiles WHERE id = p_user_id) THEN
    SELECT org_id INTO v_org_id FROM user_profiles WHERE id = p_user_id;
    SELECT id    INTO v_outlet_id FROM outlets WHERE org_id = v_org_id LIMIT 1;
    RETURN json_build_object('org_id', v_org_id, 'outlet_id', v_outlet_id);
  END IF;

  INSERT INTO organizations (name) VALUES (p_org_name) RETURNING id INTO v_org_id;
  INSERT INTO outlets (org_id, name) VALUES (v_org_id, p_outlet_name) RETURNING id INTO v_outlet_id;
  INSERT INTO user_profiles (id, org_id, full_name, role, outlet_ids)
  VALUES (p_user_id, v_org_id, p_full_name, 'owner', ARRAY[v_outlet_id]);

  INSERT INTO chart_of_accounts (org_id, code, name, type) VALUES
    (v_org_id, '1-1-001', 'Kas',                   'asset'),
    (v_org_id, '1-1-002', 'Bank',                  'asset'),
    (v_org_id, '1-1-003', 'Piutang Usaha',          'asset'),
    (v_org_id, '1-1-004', 'Persediaan Bahan Baku',  'asset'),
    (v_org_id, '1-1-005', 'Persediaan WIP',         'asset'),
    (v_org_id, '1-2-001', 'Aset Tetap',             'asset'),
    (v_org_id, '2-1-001', 'Hutang Usaha',           'liability'),
    (v_org_id, '2-1-002', 'Hutang Pajak',           'liability'),
    (v_org_id, '3-1-001', 'Modal Pemilik',          'equity'),
    (v_org_id, '4-1-001', 'Pendapatan Makanan',     'income'),
    (v_org_id, '4-1-002', 'Pendapatan Minuman',     'income'),
    (v_org_id, '5-1-001', 'HPP Bahan Baku',         'expense'),
    (v_org_id, '5-1-002', 'HPP WIP Terpakai',       'expense'),
    (v_org_id, '6-1-001', 'Beban Operasional',      'expense'),
    (v_org_id, '6-1-002', 'Beban Utilitas',         'expense'),
    (v_org_id, '6-1-003', 'Beban Sewa',             'expense'),
    (v_org_id, '6-1-004', 'Beban Tenaga Kerja',     'expense');

  RETURN json_build_object('org_id', v_org_id, 'outlet_id', v_outlet_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_new_org(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_new_org(UUID, TEXT, TEXT, TEXT) TO anon;


-- ─── SECTION 15: POST_INVOICE RPC (final version) ──────────────────────────
DROP FUNCTION IF EXISTS post_invoice(UUID, UUID, UUID, JSONB);
DROP FUNCTION IF EXISTS post_invoice(UUID, UUID, UUID, JSONB, UUID);

CREATE OR REPLACE FUNCTION post_invoice(
  p_invoice_id    UUID,
  p_outlet_id     UUID,
  p_org_id        UUID,
  p_lines         JSONB,
  p_credit_coa_id UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  line              RECORD;
  v_invoice_line_id UUID;
  v_batch_id        UUID;
  v_ap_coa_id       UUID;
  v_credit_coa_type TEXT;
  v_total_amount    NUMERIC := 0;
BEGIN
  IF p_credit_coa_id IS NOT NULL THEN
    v_ap_coa_id := p_credit_coa_id;
  ELSE
    SELECT coa_id INTO v_ap_coa_id FROM default_coa_mappings
      WHERE org_id = p_org_id AND account_role = 'accounts_payable';
    IF v_ap_coa_id IS NULL THEN
      SELECT id INTO v_ap_coa_id FROM chart_of_accounts
        WHERE org_id = p_org_id AND code = '2-1-001' LIMIT 1;
    END IF;
  END IF;

  IF v_ap_coa_id IS NULL THEN
    RAISE EXCEPTION 'Closing COA (credit account) not found or configured';
  END IF;

  SELECT type INTO v_credit_coa_type FROM chart_of_accounts WHERE id = v_ap_coa_id;

  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    item_id UUID, qty DECIMAL, unit_price DECIMAL, total_price DECIMAL,
    description TEXT, coa_id UUID, is_inventory BOOLEAN
  )
  LOOP
    v_total_amount := v_total_amount + line.total_price;

    INSERT INTO invoice_lines (invoice_id, item_master_id, qty, unit_price, total, is_inventory, description, coa_id)
    VALUES (p_invoice_id, line.item_id, line.qty, line.unit_price, line.total_price,
            COALESCE(line.is_inventory, true), line.description, line.coa_id)
    RETURNING id INTO v_invoice_line_id;

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
        qty_on_hand      = inventory_balance.qty_on_hand + EXCLUDED.qty_on_hand,
        inventory_value  = inventory_balance.inventory_value + EXCLUDED.inventory_value,
        updated_at       = NOW();
    END IF;

    IF line.coa_id IS NOT NULL THEN
      INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
      VALUES (p_outlet_id, CURRENT_DATE, line.coa_id, line.total_price, 0, p_invoice_id, 'invoice', COALESCE(line.description, 'Purchase'));
    END IF;
  END LOOP;

  IF v_ap_coa_id IS NOT NULL AND v_total_amount > 0 THEN
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, CURRENT_DATE, v_ap_coa_id, 0, v_total_amount, p_invoice_id, 'invoice', 'Purchase Invoice Closing Entry');
  END IF;

  IF v_credit_coa_type = 'asset' THEN
    UPDATE invoices SET status = 'posted', approved_at = NOW(), approved_by = auth.uid(),
      payment_status = 'paid', paid_amount = v_total_amount WHERE id = p_invoice_id;
  ELSE
    UPDATE invoices SET status = 'posted', approved_at = NOW(), approved_by = auth.uid(),
      payment_status = 'unpaid', paid_amount = 0 WHERE id = p_invoice_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── SECTION 16: POST_PRODUCTION RPC ───────────────────────────────────────
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
  INSERT INTO production_log (outlet_id, wip_item_id, qty_produced, production_date, unit_cost, notes)
  VALUES (p_outlet_id, p_wip_item_id, p_qty_produced, p_production_date,
          p_total_cost / NULLIF(p_qty_produced, 0), p_notes)
  RETURNING id INTO v_log_id;

  FOR deduction IN SELECT * FROM jsonb_to_recordset(p_input_deductions) AS x(item_id UUID, qty DECIMAL, cost DECIMAL)
  LOOP
    UPDATE inventory_balance
    SET qty_on_hand     = qty_on_hand - deduction.qty,
        inventory_value = inventory_value - deduction.cost,
        updated_at      = NOW()
    WHERE outlet_id = p_outlet_id AND item_id = deduction.item_id;

    INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
    VALUES (p_outlet_id, deduction.item_id, 'PRODUCTION_OUT', -deduction.qty,
            deduction.cost / NULLIF(deduction.qty, 0), deduction.cost, 'production', v_log_id);
  END LOOP;

  INSERT INTO inventory_balance (outlet_id, item_id, qty_on_hand, inventory_value)
  VALUES (p_outlet_id, p_wip_item_id, p_qty_produced, p_total_cost)
  ON CONFLICT (outlet_id, item_id)
  DO UPDATE SET
    qty_on_hand     = inventory_balance.qty_on_hand + EXCLUDED.qty_on_hand,
    inventory_value = inventory_balance.inventory_value + EXCLUDED.inventory_value,
    updated_at      = NOW();

  INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
  VALUES (p_outlet_id, p_wip_item_id, 'PRODUCTION_IN', p_qty_produced,
          p_total_cost / NULLIF(p_qty_produced, 0), p_total_cost, 'production', v_log_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── SECTION 17: SAVE_BOM RPC ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION save_bom(
  p_output_item_id UUID,
  p_lines          JSONB
) RETURNS VOID AS $$
DECLARE
  v_org_id UUID;
  line     RECORD;
BEGIN
  SELECT org_id INTO v_org_id FROM public.user_profiles WHERE id = auth.uid();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM item_master WHERE id = p_output_item_id AND org_id = v_org_id) THEN
    RAISE EXCEPTION 'Access denied to the target item';
  END IF;

  DELETE FROM public.bom WHERE output_item_id = p_output_item_id;

  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    input_item_id UUID, qty_per_unit NUMERIC, unit TEXT
  )
  LOOP
    IF line.input_item_id IS NOT NULL AND line.qty_per_unit > 0 THEN
      INSERT INTO public.bom (org_id, output_item_id, input_item_id, qty_per_unit, unit)
      VALUES (v_org_id, p_output_item_id, line.input_item_id, line.qty_per_unit, COALESCE(line.unit, 'pcs'));
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── SECTION 18: RECORD_AP_PAYMENT RPC ─────────────────────────────────────
CREATE OR REPLACE FUNCTION record_ap_payment(
  p_invoice_id   UUID,
  p_org_id       UUID,
  p_outlet_id    UUID,
  p_payment_date DATE,
  p_amount       NUMERIC,
  p_coa_id       UUID,
  p_reference_no TEXT,
  p_notes        TEXT
) RETURNS VOID AS $$
DECLARE
  v_invoice_grand_total NUMERIC;
  v_current_paid        NUMERIC;
  v_new_paid            NUMERIC;
  v_ap_coa_id           UUID;
  v_payment_id          UUID;
BEGIN
  SELECT grand_total, paid_amount INTO v_invoice_grand_total, v_current_paid
  FROM invoices WHERE id = p_invoice_id;

  SELECT coa_id INTO v_ap_coa_id FROM default_coa_mappings
    WHERE org_id = p_org_id AND account_role = 'accounts_payable';
  IF v_ap_coa_id IS NULL THEN
    RAISE EXCEPTION 'Accounts Payable COA not configured';
  END IF;

  INSERT INTO ap_payments (org_id, outlet_id, invoice_id, payment_date, amount, coa_id, reference_no, notes, created_by)
  VALUES (p_org_id, p_outlet_id, p_invoice_id, p_payment_date, p_amount, p_coa_id, p_reference_no, p_notes, auth.uid())
  RETURNING id INTO v_payment_id;

  v_new_paid := v_current_paid + p_amount;
  UPDATE invoices SET
    paid_amount    = v_new_paid,
    payment_status = CASE
      WHEN v_new_paid >= v_invoice_grand_total THEN 'paid'
      WHEN v_new_paid > 0                      THEN 'partial'
      ELSE 'unpaid'
    END
  WHERE id = p_invoice_id;

  INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
  VALUES (p_outlet_id, p_payment_date, v_ap_coa_id, p_amount, 0, v_payment_id, 'ap_payment', 'Payment for invoice ' || p_invoice_id);

  INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
  VALUES (p_outlet_id, p_payment_date, p_coa_id, 0, p_amount, v_payment_id, 'ap_payment', 'Payment for invoice ' || p_invoice_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── SECTION 19: PREVIEW_JOURNAL RPC ───────────────────────────────────────
CREATE OR REPLACE FUNCTION preview_journal(
  p_invoice_id    UUID,
  p_org_id        UUID,
  p_lines         JSONB,
  p_credit_coa_id UUID DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  line            RECORD;
  v_ap_coa_id     UUID;
  v_ppn_coa_id    UUID;
  v_total_amount  NUMERIC := 0;
  v_journal       JSONB := '[]'::JSONB;
  v_ap_coa_name   TEXT; v_ap_coa_code TEXT;
  v_ppn_coa_name  TEXT; v_ppn_coa_code TEXT;
  v_line_coa_name TEXT; v_line_coa_code TEXT;
BEGIN
  IF p_credit_coa_id IS NOT NULL THEN
    v_ap_coa_id := p_credit_coa_id;
  ELSE
    SELECT coa_id INTO v_ap_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'accounts_payable';
    IF v_ap_coa_id IS NULL THEN
      SELECT id INTO v_ap_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code = '2-1-001' LIMIT 1;
    END IF;
  END IF;
  SELECT coa_id INTO v_ppn_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'ppn_masukan';
  IF v_ap_coa_id IS NOT NULL THEN SELECT name, code INTO v_ap_coa_name, v_ap_coa_code FROM chart_of_accounts WHERE id = v_ap_coa_id; END IF;
  IF v_ppn_coa_id IS NOT NULL THEN SELECT name, code INTO v_ppn_coa_name, v_ppn_coa_code FROM chart_of_accounts WHERE id = v_ppn_coa_id; END IF;

  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    item_id UUID, total_price DECIMAL, description TEXT, coa_id UUID, ppn_amount DECIMAL
  )
  LOOP
    v_total_amount := v_total_amount + line.total_price + COALESCE(line.ppn_amount, 0);
    IF line.coa_id IS NOT NULL THEN
      SELECT name, code INTO v_line_coa_name, v_line_coa_code FROM chart_of_accounts WHERE id = line.coa_id;
      v_journal := v_journal || jsonb_build_object(
        'coa_id', line.coa_id, 'coa_code', v_line_coa_code, 'coa_name', v_line_coa_name,
        'debit', line.total_price, 'credit', 0, 'description', COALESCE(line.description, 'Purchase')
      );
    END IF;
    IF COALESCE(line.ppn_amount, 0) > 0 AND v_ppn_coa_id IS NOT NULL THEN
      v_journal := v_journal || jsonb_build_object(
        'coa_id', v_ppn_coa_id, 'coa_code', v_ppn_coa_code, 'coa_name', v_ppn_coa_name,
        'debit', line.ppn_amount, 'credit', 0, 'description', 'PPN Masukan: ' || COALESCE(line.description, '')
      );
    END IF;
  END LOOP;

  IF v_ap_coa_id IS NOT NULL AND v_total_amount > 0 THEN
    v_journal := v_journal || jsonb_build_object(
      'coa_id', v_ap_coa_id, 'coa_code', v_ap_coa_code, 'coa_name', v_ap_coa_name,
      'debit', 0, 'credit', v_total_amount, 'description', 'Purchase Invoice Closing Entry'
    );
  END IF;

  RETURN v_journal;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── SECTION 20: CLEAN UP ORPHANED TEST DATA ───────────────────────────────
-- Removes data created by the auth user that signed up but whose profile
-- was not properly created (due to missing RLS). Safe to run — only deletes
-- orgs/outlets that have no associated user_profiles.
DELETE FROM outlets
WHERE org_id IN (
  SELECT id FROM organizations
  WHERE id NOT IN (SELECT org_id FROM user_profiles WHERE org_id IS NOT NULL)
);

DELETE FROM organizations
WHERE id NOT IN (SELECT org_id FROM user_profiles WHERE org_id IS NOT NULL);

-- ===========================================================================
-- DONE. Now re-register at /register with any email.
-- ===========================================================================
