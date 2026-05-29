CREATE TABLE tenant_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  description TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'pending', -- pending, paid, overdue, canceled
  due_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE tenant_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access their org invoices" ON tenant_invoices 
  FOR ALL 
  USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));
