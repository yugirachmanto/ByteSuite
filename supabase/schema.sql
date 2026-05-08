-- 0. CLEANUP EXISTING SCHEMA (WARNING: This will drop your existing app data but preserve Auth users)
DROP TABLE IF EXISTS user_integrations CASCADE;
DROP TABLE IF EXISTS gl_entries CASCADE;
DROP TABLE IF EXISTS opname_log CASCADE;
DROP TABLE IF EXISTS production_log CASCADE;
DROP TABLE IF EXISTS inventory_balance CASCADE;
DROP TABLE IF EXISTS stock_ledger CASCADE;
DROP TABLE IF EXISTS stock_batches CASCADE;
DROP TABLE IF EXISTS invoice_lines CASCADE;
DROP TABLE IF EXISTS invoices CASCADE;
DROP TABLE IF EXISTS bom CASCADE;
DROP TABLE IF EXISTS item_master CASCADE;
DROP TABLE IF EXISTS chart_of_accounts CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;
DROP TABLE IF EXISTS outlets CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS coa_type CASCADE;
DROP TYPE IF EXISTS item_category CASCADE;
DROP TYPE IF EXISTS invoice_status CASCADE;
DROP TYPE IF EXISTS ledger_txn_type CASCADE;

-- 1. ENUMS
CREATE TYPE user_role AS ENUM ('owner', 'finance', 'cashier', 'kitchen', 'viewer');
CREATE TYPE coa_type AS ENUM ('asset', 'liability', 'equity', 'income', 'expense');
CREATE TYPE item_category AS ENUM ('raw', 'wip', 'packaging', 'recipe', 'finished');
CREATE TYPE invoice_status AS ENUM ('pending', 'extracted', 'reviewed', 'posted', 'rejected');
CREATE TYPE ledger_txn_type AS ENUM ('IN', 'OUT', 'PRODUCTION_IN', 'PRODUCTION_OUT', 'OPNAME_ADJ');

-- 2. CORE TABLES
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE outlets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  timezone TEXT DEFAULT 'Asia/Jakarta',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Note: user_profiles links to auth.users created by Supabase Auth
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES organizations(id),
  full_name TEXT,
  role user_role DEFAULT 'viewer',
  outlet_ids UUID[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true
);

-- 3. MASTER DATA
CREATE TABLE chart_of_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  type coa_type NOT NULL,
  parent_id UUID REFERENCES chart_of_accounts(id),
  is_active BOOLEAN DEFAULT true
);

CREATE TABLE item_master (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  code TEXT,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  category item_category NOT NULL,
  is_inventory BOOLEAN DEFAULT true,
  default_coa_id UUID REFERENCES chart_of_accounts(id),
  reorder_level NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE bom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES organizations(id),
  output_item_id UUID REFERENCES item_master(id) ON DELETE CASCADE,
  input_item_id UUID REFERENCES item_master(id) ON DELETE RESTRICT,
  qty_per_unit NUMERIC NOT NULL,
  unit TEXT NOT NULL
);

-- 4. INVOICES
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID REFERENCES outlets(id),
  image_url TEXT,
  status invoice_status DEFAULT 'pending',
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

-- 5. INVENTORY & LEDGER
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
  txn_type ledger_txn_type NOT NULL,
  qty NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL,
  total_value NUMERIC NOT NULL,
  reference_id UUID,
  reference_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE inventory_balance (
  outlet_id UUID REFERENCES outlets(id),
  item_id UUID REFERENCES item_master(id),
  qty_on_hand NUMERIC DEFAULT 0,
  inventory_value NUMERIC DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (outlet_id, item_id)
);

-- 6. TRANSACTIONS (Production & Opname)
CREATE TABLE production_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID REFERENCES outlets(id),
  wip_item_id UUID REFERENCES item_master(id),
  qty_produced NUMERIC NOT NULL,
  production_date DATE NOT NULL,
  unit_cost NUMERIC,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE opname_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID REFERENCES outlets(id),
  opname_date DATE NOT NULL,
  item_id UUID REFERENCES item_master(id),
  system_qty NUMERIC NOT NULL,
  physical_qty NUMERIC NOT NULL,
  variance NUMERIC GENERATED ALWAYS AS (physical_qty - system_qty) STORED,
  variance_value NUMERIC,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. GENERAL LEDGER
CREATE TABLE gl_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id UUID REFERENCES outlets(id),
  org_id UUID REFERENCES organizations(id),
  entry_date DATE NOT NULL,
  coa_id UUID REFERENCES chart_of_accounts(id),
  debit NUMERIC DEFAULT 0,
  credit NUMERIC DEFAULT 0,
  reference_id UUID,
  reference_type TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. INTEGRATIONS
CREATE TABLE user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  org_id UUID REFERENCES organizations(id),
  provider TEXT DEFAULT 'google_sheets',
  access_token TEXT,
  refresh_token TEXT,
  sheet_id TEXT,
  sync_config JSONB,
  last_synced_at TIMESTAMPTZ
);

-- 9. RPC FUNCTIONS FOR ATOMIC OPERATIONS
CREATE OR REPLACE FUNCTION post_production(
  p_outlet_id UUID,
  p_wip_item_id UUID,
  p_qty_produced DECIMAL,
  p_production_date DATE,
  p_notes TEXT,
  p_total_cost DECIMAL,
  p_input_deductions JSONB
) RETURNS VOID AS $$
DECLARE
  v_log_id UUID;
  deduction RECORD;
BEGIN
  -- Create Production Log
  INSERT INTO production_log (outlet_id, wip_item_id, qty_produced, production_date, unit_cost, notes)
  VALUES (p_outlet_id, p_wip_item_id, p_qty_produced, p_production_date, p_total_cost / NULLIF(p_qty_produced, 0), p_notes)
  RETURNING id INTO v_log_id;

  -- Deduct Raw Materials (from JSON payload)
  FOR deduction IN SELECT * FROM jsonb_to_recordset(p_input_deductions) AS x(item_id UUID, qty DECIMAL, cost DECIMAL)
  LOOP
    -- Update Inventory Balance (Deduct)
    UPDATE inventory_balance
    SET qty_on_hand = qty_on_hand - deduction.qty,
        inventory_value = inventory_value - deduction.cost,
        updated_at = NOW()
    WHERE outlet_id = p_outlet_id AND item_id = deduction.item_id;

    -- Stock Ledger (OUT)
    INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
    VALUES (p_outlet_id, deduction.item_id, 'PRODUCTION_OUT', -deduction.qty, deduction.cost / NULLIF(deduction.qty, 0), deduction.cost, 'production', v_log_id);
  END LOOP;

  -- Add WIP to Inventory Balance (Add)
  INSERT INTO inventory_balance (outlet_id, item_id, qty_on_hand, inventory_value)
  VALUES (p_outlet_id, p_wip_item_id, p_qty_produced, p_total_cost)
  ON CONFLICT (outlet_id, item_id)
  DO UPDATE SET 
    qty_on_hand = inventory_balance.qty_on_hand + EXCLUDED.qty_on_hand,
    inventory_value = inventory_balance.inventory_value + EXCLUDED.inventory_value,
    updated_at = NOW();

  -- Stock Ledger (IN)
  INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
  VALUES (p_outlet_id, p_wip_item_id, 'PRODUCTION_IN', p_qty_produced, p_total_cost / NULLIF(p_qty_produced, 0), p_total_cost, 'production', v_log_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION post_invoice(
  p_invoice_id UUID,
  p_outlet_id UUID,
  p_org_id UUID,
  p_lines JSONB
) RETURNS VOID AS $$
DECLARE
  line RECORD;
  v_batch_id UUID;
BEGIN
  -- Update Invoice status
  UPDATE invoices SET status = 'posted', updated_at = NOW() WHERE id = p_invoice_id;

  -- Process each line
  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(item_id UUID, qty DECIMAL, unit_price DECIMAL, total_price DECIMAL, coa_id UUID)
  LOOP
    -- 1. Create Stock Batch
    INSERT INTO stock_batches (outlet_id, item_id, purchase_date, original_qty, qty_remaining, unit_cost)
    VALUES (p_outlet_id, line.item_id, CURRENT_DATE, line.qty, line.qty, line.unit_price)
    RETURNING id INTO v_batch_id;

    -- 2. Create Stock Ledger Entry
    INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
    VALUES (p_outlet_id, line.item_id, 'IN', line.qty, line.unit_price, line.total_price, 'invoice', p_invoice_id);

    -- 3. Upsert Inventory Balance
    INSERT INTO inventory_balance (outlet_id, item_id, qty_on_hand, inventory_value)
    VALUES (p_outlet_id, line.item_id, line.qty, line.total_price)
    ON CONFLICT (outlet_id, item_id)
    DO UPDATE SET 
      qty_on_hand = inventory_balance.qty_on_hand + EXCLUDED.qty_on_hand,
      inventory_value = inventory_balance.inventory_value + EXCLUDED.inventory_value,
      updated_at = NOW();

    -- 4. Create GL Records
    IF line.coa_id IS NOT NULL THEN
      -- Debit Inventory/Expense account
      INSERT INTO gl_entries (org_id, outlet_id, entry_date, coa_id, debit, credit, description, reference_type, reference_id)
      VALUES (p_org_id, p_outlet_id, CURRENT_DATE, line.coa_id, line.total_price, 0, 'Invoice Purchase', 'invoice', p_invoice_id);
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;



