-- Create product_prices table
CREATE TABLE IF NOT EXISTS product_prices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  outlet_id       UUID NOT NULL REFERENCES outlets(id),
  item_id         UUID NOT NULL REFERENCES item_master(id) ON DELETE CASCADE,
  selling_price   NUMERIC NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (outlet_id, item_id)
);

-- Enable RLS
ALTER TABLE product_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org access" ON product_prices FOR ALL USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_product_prices_updated_at
    BEFORE UPDATE ON product_prices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
