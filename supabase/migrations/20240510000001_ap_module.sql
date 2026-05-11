-- 1. Modify invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'partial', 'paid'));

-- 2. Create ap_payments table
CREATE TABLE IF NOT EXISTS ap_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  outlet_id       UUID NOT NULL REFERENCES outlets(id),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  amount          NUMERIC NOT NULL,
  coa_id          UUID NOT NULL REFERENCES chart_of_accounts(id), -- The Cash/Bank account used
  reference_no    TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 3. Enable RLS
ALTER TABLE ap_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org access" ON ap_payments FOR ALL USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));

-- 4. record_ap_payment RPC
CREATE OR REPLACE FUNCTION record_ap_payment(
  p_invoice_id UUID,
  p_org_id UUID,
  p_outlet_id UUID,
  p_payment_date DATE,
  p_amount NUMERIC,
  p_coa_id UUID,
  p_reference_no TEXT,
  p_notes TEXT
) RETURNS VOID AS $$
DECLARE
  v_invoice_grand_total NUMERIC;
  v_current_paid        NUMERIC;
  v_new_paid           NUMERIC;
  v_ap_coa_id          UUID;
  v_payment_id         UUID;
BEGIN
  -- 1. Load invoice data
  SELECT grand_total, paid_amount INTO v_invoice_grand_total, v_current_paid
  FROM invoices WHERE id = p_invoice_id;

  -- 2. Resolve AP account for this org
  SELECT coa_id INTO v_ap_coa_id
    FROM default_coa_mappings
    WHERE org_id = p_org_id AND account_role = 'accounts_payable';

  IF v_ap_coa_id IS NULL THEN
    RAISE EXCEPTION 'Accounts Payable COA not configured';
  END IF;

  -- 3. Insert Payment Record
  INSERT INTO ap_payments (org_id, outlet_id, invoice_id, payment_date, amount, coa_id, reference_no, notes, created_by)
  VALUES (p_org_id, p_outlet_id, p_invoice_id, p_payment_date, p_amount, p_coa_id, p_reference_no, p_notes, auth.uid())
  RETURNING id INTO v_payment_id;

  -- 4. Update Invoice Balance & Status
  v_new_paid := v_current_paid + p_amount;
  
  UPDATE invoices SET 
    paid_amount = v_new_paid,
    payment_status = CASE 
      WHEN v_new_paid >= v_invoice_grand_total THEN 'paid'
      WHEN v_new_paid > 0 THEN 'partial'
      ELSE 'unpaid'
    END
  WHERE id = p_invoice_id;

  -- 5. GL Entries
  -- Debit: Accounts Payable (Reducing liability)
  INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
  VALUES (p_outlet_id, p_payment_date, v_ap_coa_id, p_amount, 0, v_payment_id, 'ap_payment', 'Payment for invoice ' || p_invoice_id);

  -- Credit: Cash/Bank (Reducing asset)
  INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
  VALUES (p_outlet_id, p_payment_date, p_coa_id, 0, p_amount, v_payment_id, 'ap_payment', 'Payment for invoice ' || p_invoice_id);

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
