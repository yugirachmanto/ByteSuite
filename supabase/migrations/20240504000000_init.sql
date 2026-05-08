-- Multi-tenancy
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE outlets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  name TEXT NOT NULL,
  address TEXT,
  timezone TEXT DEFAULT 'Asia/Jakarta',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User profiles (extends Supabase auth.users)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  org_id UUID REFERENCES organizations(id),
  full_name TEXT,
  role TEXT CHECK (role IN ('owner','finance','cashier','kitchen','viewer')),
  outlet_ids UUID[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true
);

-- Reference tables
CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('asset','liability','equity','income','expense')),
  parent_id UUID REFERENCES chart_of_accounts(id),
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE item_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  code TEXT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  category TEXT CHECK (category IN ('raw','wip','packaging','finished')),
  is_inventory BOOLEAN DEFAULT true,
  default_coa_id UUID REFERENCES chart_of_accounts(id),
  reorder_level NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE bom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  output_item_id UUID REFERENCES item_master(id),
  input_item_id UUID REFERENCES item_master(id),
  qty_per_unit NUMERIC NOT NULL,
  unit TEXT NOT NULL
);

-- Invoice pipeline
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID REFERENCES outlets(id),
  image_url TEXT,
  status TEXT CHECK (status IN ('pending','extracted','reviewed','posted','rejected')) DEFAULT 'pending',
  vendor TEXT,
  invoice_no TEXT,
  invoice_date DATE,
  currency TEXT DEFAULT 'IDR',
  subtotal NUMERIC,
  tax_total NUMERIC,
  grand_total NUMERIC,
  extracted_data JSONB,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  item_master_id UUID REFERENCES item_master(id),
  description TEXT,
  qty NUMERIC NOT NULL,
  unit TEXT,
  unit_price NUMERIC NOT NULL,
  total NUMERIC NOT NULL,
  coa_id UUID REFERENCES chart_of_accounts(id),
  is_inventory BOOLEAN DEFAULT false
);

-- Inventory engine
CREATE TABLE stock_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID REFERENCES outlets(id),
  item_id UUID REFERENCES item_master(id),
  purchase_date DATE NOT NULL,
  original_qty NUMERIC NOT NULL,
  qty_remaining NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL,
  invoice_line_id UUID REFERENCES invoice_lines(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE stock_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID REFERENCES outlets(id),
  item_id UUID REFERENCES item_master(id),
  txn_type TEXT CHECK (txn_type IN ('IN','OUT','PRODUCTION_IN','PRODUCTION_OUT','OPNAME_ADJ')),
  qty NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL,      -- FIFO-AVG cost for OUT; purchase cost for IN
  total_value NUMERIC NOT NULL,
  reference_id UUID,
  reference_type TEXT,             -- 'invoice','production_log','opname_log'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Derived / maintained balance
CREATE TABLE inventory_balance (
  outlet_id UUID REFERENCES outlets(id),
  item_id UUID REFERENCES item_master(id),
  qty_on_hand NUMERIC DEFAULT 0,
  inventory_value NUMERIC DEFAULT 0,  -- sum of remaining batches at original cost
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (outlet_id, item_id)
);

-- WIP Production
CREATE TABLE production_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID REFERENCES outlets(id),
  wip_item_id UUID REFERENCES item_master(id),
  qty_produced NUMERIC NOT NULL,
  production_date DATE NOT NULL,
  unit_cost NUMERIC,               -- calculated: sum of raw material costs / qty_produced
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Physical count
CREATE TABLE opname_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID REFERENCES outlets(id),
  opname_date DATE NOT NULL,
  item_id UUID REFERENCES item_master(id),
  system_qty NUMERIC NOT NULL,
  physical_qty NUMERIC NOT NULL,
  variance NUMERIC GENERATED ALWAYS AS (physical_qty - system_qty) STORED,
  variance_value NUMERIC,          -- variance × current unit cost
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- General ledger
CREATE TABLE gl_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID REFERENCES outlets(id),
  entry_date DATE NOT NULL,
  coa_id UUID REFERENCES chart_of_accounts(id),
  debit NUMERIC DEFAULT 0,
  credit NUMERIC DEFAULT 0,
  reference_id UUID,
  reference_type TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Integration config
CREATE TABLE user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  org_id UUID REFERENCES organizations(id),
  provider TEXT DEFAULT 'google_sheets',
  access_token TEXT,
  refresh_token TEXT,
  sheet_id TEXT,
  sync_config JSONB,               -- maps table names to sheet tab names
  last_synced_at TIMESTAMPTZ
);

-- RLS Policies
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE chart_of_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE opname_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE gl_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;

-- Helper function for RLS
CREATE OR REPLACE FUNCTION auth.uid_org_id()
RETURNS UUID AS $$
  SELECT org_id FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE;

-- Example Policies (Generic pattern from plan)
CREATE POLICY "Users can access their org data" ON organizations FOR ALL USING (id = auth.uid_org_id());
CREATE POLICY "Users can access their outlet data" ON outlets FOR ALL USING (org_id = auth.uid_org_id());

-- Transactional tables policies
CREATE POLICY "Outlet access" ON invoices FOR ALL USING (outlet_id = ANY(SELECT unnest(outlet_ids) FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "Outlet access" ON stock_ledger FOR ALL USING (outlet_id = ANY(SELECT unnest(outlet_ids) FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "Outlet access" ON stock_batches FOR ALL USING (outlet_id = ANY(SELECT unnest(outlet_ids) FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "Outlet access" ON inventory_balance FOR ALL USING (outlet_id = ANY(SELECT unnest(outlet_ids) FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "Outlet access" ON production_log FOR ALL USING (outlet_id = ANY(SELECT unnest(outlet_ids) FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "Outlet access" ON opname_log FOR ALL USING (outlet_id = ANY(SELECT unnest(outlet_ids) FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "Outlet access" ON gl_entries FOR ALL USING (outlet_id = ANY(SELECT unnest(outlet_ids) FROM user_profiles WHERE id = auth.uid()));
