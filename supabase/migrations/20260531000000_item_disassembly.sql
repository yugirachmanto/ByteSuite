-- Add flag to item_master
ALTER TABLE item_master ADD COLUMN requires_disassembly BOOLEAN DEFAULT FALSE;

-- Template components per parent item
CREATE TABLE disassembly_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_item_id      UUID NOT NULL REFERENCES item_master(id) ON DELETE CASCADE,
  child_item_name     VARCHAR(255) NOT NULL,
  unit                VARCHAR(50) NOT NULL,
  default_yield_pct   DECIMAL(5,2),
  waste_threshold_pct DECIMAL(5,2) DEFAULT 20.00,
  sort_order          INTEGER DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log per disassembly transaction
CREATE TABLE disassembly_logs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id           UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  parent_item_id       UUID NOT NULL REFERENCES item_master(id),
  total_qty            DECIMAL(10,3) NOT NULL,
  status               VARCHAR(50) DEFAULT 'pending', -- pending | completed
  performed_at         TIMESTAMPTZ,
  performed_by         UUID REFERENCES auth.users(id),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Component details per log
CREATE TABLE disassembly_log_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id          UUID NOT NULL REFERENCES disassembly_logs(id) ON DELETE CASCADE,
  item_id         UUID NOT NULL REFERENCES item_master(id),
  qty_actual      DECIMAL(10,3) NOT NULL,
  cost_allocated  DECIMAL(15,2) DEFAULT 0
);

-- RLS Policies
ALTER TABLE disassembly_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE disassembly_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE disassembly_log_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org access templates" ON disassembly_templates FOR ALL 
USING (parent_item_id IN (SELECT id FROM item_master WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())));

CREATE POLICY "Org access logs" ON disassembly_logs FOR ALL 
USING (invoice_id IN (SELECT id FROM invoices WHERE outlet_id = ANY(SELECT unnest(outlet_ids) FROM user_profiles WHERE id = auth.uid())));

CREATE POLICY "Org access log items" ON disassembly_log_items FOR ALL 
USING (log_id IN (SELECT id FROM disassembly_logs WHERE invoice_id IN (SELECT id FROM invoices WHERE outlet_id = ANY(SELECT unnest(outlet_ids) FROM user_profiles WHERE id = auth.uid()))));
