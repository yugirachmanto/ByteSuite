-- Fase 3: AR (Accounts Receivable / customer invoicing) module — mirrors the
-- existing AP/vendor module in reverse. Scope is deliberately limited to the
-- financial side (no item_master/inventory/COGS linkage — general billing
-- for credit sales, catering, etc., not a POS extension).
--
-- Per product decision, these 4 new tables get role-aware RLS (not just
-- org/outlet-scoped like every other table today) — owner/admin/finance can
-- write, viewer can read-only, cashier/kitchen have no access at all. This
-- is scoped to only these new tables; app-wide role enforcement (Fase 2)
-- remains separate future work.

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  payment_terms_days INT NOT NULL DEFAULT 30,
  credit_limit NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  invoice_no TEXT,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  subtotal NUMERIC NOT NULL,
  tax_total NUMERIC NOT NULL DEFAULT 0,
  grand_total NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'voided')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  paid_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES customer_invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  qty NUMERIC NOT NULL,
  unit_price NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  coa_id UUID NOT NULL REFERENCES chart_of_accounts(id)
);

CREATE TABLE ar_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id),
  outlet_id UUID NOT NULL REFERENCES outlets(id),
  invoice_id UUID NOT NULL REFERENCES customer_invoices(id),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL,
  coa_id UUID NOT NULL REFERENCES chart_of_accounts(id),
  reference_no TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE ar_payments ENABLE ROW LEVEL SECURITY;

-- customers: org-scoped, role-gated
CREATE POLICY "AR read" ON customers FOR SELECT USING (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance','viewer')
);
CREATE POLICY "AR write insert" ON customers FOR INSERT WITH CHECK (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
CREATE POLICY "AR write update" ON customers FOR UPDATE USING (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
CREATE POLICY "AR write delete" ON customers FOR DELETE USING (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);

-- customer_invoices: outlet-scoped (org via outlets), role-gated
CREATE POLICY "AR read" ON customer_invoices FOR SELECT USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance','viewer')
);
CREATE POLICY "AR write insert" ON customer_invoices FOR INSERT WITH CHECK (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
CREATE POLICY "AR write update" ON customer_invoices FOR UPDATE USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);

-- customer_invoice_lines: via parent invoice
CREATE POLICY "AR read" ON customer_invoice_lines FOR SELECT USING (
  invoice_id IN (
    SELECT ci.id FROM customer_invoices ci
    JOIN outlets o ON o.id = ci.outlet_id
    WHERE o.org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  )
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance','viewer')
);
CREATE POLICY "AR write insert" ON customer_invoice_lines FOR INSERT WITH CHECK (
  invoice_id IN (
    SELECT ci.id FROM customer_invoices ci
    JOIN outlets o ON o.id = ci.outlet_id
    WHERE o.org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  )
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);

-- ar_payments: org-scoped, role-gated
CREATE POLICY "AR read" ON ar_payments FOR SELECT USING (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance','viewer')
);
CREATE POLICY "AR write insert" ON ar_payments FOR INSERT WITH CHECK (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);

-- ============================================================
-- post_customer_invoice — mirrors post_invoice, reversed direction.
-- ============================================================
CREATE OR REPLACE FUNCTION public.post_customer_invoice(
  p_org_id UUID, p_outlet_id UUID, p_customer_id UUID,
  p_invoice_no TEXT, p_invoice_date DATE, p_due_date DATE,
  p_lines JSONB, p_tax_amount NUMERIC, p_notes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_ar_coa_id UUID;
  v_ppn_keluaran_coa_id UUID;
  v_invoice_id UUID;
  line RECORD;
  v_subtotal NUMERIC := 0;
  v_grand_total NUMERIC;
BEGIN
  -- Resolve AR account: mapping first, then the seeded AR header account.
  -- Mapping first, then the first leaf (non-header) account under the seeded
  -- AR sub-tree — the header account 1-2-00-000 itself is a rollup account
  -- and a DB-level trigger (check_coa_is_leaf) rejects GL entries against it.
  SELECT coa_id INTO v_ar_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'accounts_receivable';
  IF v_ar_coa_id IS NULL THEN
    SELECT id INTO v_ar_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code LIKE '1-2%' AND is_header = false ORDER BY code LIMIT 1;
  END IF;
  IF v_ar_coa_id IS NULL THEN
    RAISE EXCEPTION 'Accounts Receivable account is not configured. Set it in Settings > Accounting Rules.';
  END IF;

  IF p_tax_amount > 0 THEN
    SELECT coa_id INTO v_ppn_keluaran_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'ppn_keluaran';
    IF v_ppn_keluaran_coa_id IS NULL THEN
      RAISE EXCEPTION 'PPN Keluaran (Output Tax) account is not configured. Set it in Settings > Accounting Rules.';
    END IF;
  END IF;

  -- Sum lines up front so grand_total/subtotal are known before insert.
  SELECT COALESCE(SUM((x.qty * x.unit_price)), 0) INTO v_subtotal
  FROM jsonb_to_recordset(p_lines) AS x(description TEXT, qty NUMERIC, unit_price NUMERIC, coa_id UUID);

  IF v_subtotal <= 0 THEN
    RAISE EXCEPTION 'Invoice must have at least one line with a positive amount.';
  END IF;

  v_grand_total := v_subtotal + COALESCE(p_tax_amount, 0);

  INSERT INTO customer_invoices (outlet_id, customer_id, invoice_no, invoice_date, due_date, subtotal, tax_total, grand_total, notes, created_by)
  VALUES (p_outlet_id, p_customer_id, p_invoice_no, COALESCE(p_invoice_date, CURRENT_DATE), p_due_date, v_subtotal, COALESCE(p_tax_amount, 0), v_grand_total, p_notes, auth.uid())
  RETURNING id INTO v_invoice_id;

  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(description TEXT, qty NUMERIC, unit_price NUMERIC, coa_id UUID)
  LOOP
    IF line.coa_id IS NULL THEN
      RAISE EXCEPTION 'Revenue account is missing for line: %', line.description;
    END IF;

    INSERT INTO customer_invoice_lines (invoice_id, description, qty, unit_price, total, coa_id)
    VALUES (v_invoice_id, line.description, line.qty, line.unit_price, line.qty * line.unit_price, line.coa_id);

    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, COALESCE(p_invoice_date, CURRENT_DATE), line.coa_id, 0, line.qty * line.unit_price, v_invoice_id, 'customer_invoice', 'Customer Invoice Revenue');
  END LOOP;

  IF p_tax_amount > 0 THEN
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, COALESCE(p_invoice_date, CURRENT_DATE), v_ppn_keluaran_coa_id, 0, p_tax_amount, v_invoice_id, 'customer_invoice', 'PPN Keluaran (Output Tax)');
  END IF;

  -- Single aggregate debit to AR for the full grand_total.
  INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
  VALUES (p_outlet_id, COALESCE(p_invoice_date, CURRENT_DATE), v_ar_coa_id, v_grand_total, 0, v_invoice_id, 'customer_invoice', 'Customer Invoice - Accounts Receivable');

  RETURN v_invoice_id;
END;
$function$;

-- ============================================================
-- record_ar_payment — mirrors record_ap_payment, reversed direction.
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_ar_payment(
  p_invoice_id UUID, p_org_id UUID, p_outlet_id UUID, p_payment_date DATE,
  p_amount NUMERIC, p_coa_id UUID, p_reference_no TEXT, p_notes TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_ar_coa_id UUID;
  v_current_paid NUMERIC;
  v_grand_total NUMERIC;
  v_new_paid NUMERIC;
  v_new_status TEXT;
  v_payment_id UUID;
BEGIN
  SELECT grand_total, paid_amount INTO v_grand_total, v_current_paid FROM customer_invoices WHERE id = p_invoice_id;
  IF v_grand_total IS NULL THEN
    RAISE EXCEPTION 'Customer invoice not found';
  END IF;

  SELECT coa_id INTO v_ar_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'accounts_receivable';
  IF v_ar_coa_id IS NULL THEN
    SELECT id INTO v_ar_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code LIKE '1-2%' AND is_header = false ORDER BY code LIMIT 1;
  END IF;
  IF v_ar_coa_id IS NULL THEN
    RAISE EXCEPTION 'Accounts Receivable account is not configured. Set it in Settings > Accounting Rules.';
  END IF;

  INSERT INTO ar_payments (org_id, outlet_id, invoice_id, payment_date, amount, coa_id, reference_no, notes, created_by)
  VALUES (p_org_id, p_outlet_id, p_invoice_id, COALESCE(p_payment_date, CURRENT_DATE), p_amount, p_coa_id, p_reference_no, p_notes, auth.uid())
  RETURNING id INTO v_payment_id;

  v_new_paid := v_current_paid + p_amount;
  v_new_status := CASE WHEN v_new_paid >= v_grand_total THEN 'paid' WHEN v_new_paid > 0 THEN 'partial' ELSE 'unpaid' END;

  UPDATE customer_invoices SET paid_amount = v_new_paid, payment_status = v_new_status WHERE id = p_invoice_id;

  -- Debit the chosen cash/bank account, credit AR (reduces the receivable).
  INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
  VALUES (p_outlet_id, COALESCE(p_payment_date, CURRENT_DATE), p_coa_id, p_amount, 0, v_payment_id, 'ar_payment', 'AR Payment Received');

  INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
  VALUES (p_outlet_id, COALESCE(p_payment_date, CURRENT_DATE), v_ar_coa_id, 0, p_amount, v_payment_id, 'ar_payment', 'AR Payment Received');

  RETURN v_payment_id;
END;
$function$;
