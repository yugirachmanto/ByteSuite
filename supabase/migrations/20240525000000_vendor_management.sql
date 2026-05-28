CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  bank_name TEXT,
  bank_account_no TEXT,
  bank_account_name TEXT,
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE invoices ADD COLUMN vendor_id UUID REFERENCES vendors(id);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view vendors in their org" ON vendors
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can insert vendors in their org" ON vendors
  FOR INSERT WITH CHECK (
    org_id IN (
      SELECT org_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can update vendors in their org" ON vendors
  FOR UPDATE USING (
    org_id IN (
      SELECT org_id FROM user_profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can delete vendors in their org" ON vendors
  FOR DELETE USING (
    org_id IN (
      SELECT org_id FROM user_profiles WHERE id = auth.uid()
    )
  );

