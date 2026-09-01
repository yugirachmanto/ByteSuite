-- Full purchasing workflow: PR -> Approval -> PO Draft -> Approval -> PO Release
-- -> Goods Receipt -> Return (optional) -> Matched Invoice -> Payment/AP.
--
-- Goods Receipt becomes the new stock-posting trigger (Option A) — GR creates
-- stock_batches/stock_ledger/inventory_balance, not invoice posting. The
-- existing post_invoice()/AI-extraction upload flow is completely untouched:
-- a separate post_matched_invoice() RPC handles the new "3-way match"
-- invoice path so there is zero regression risk to the working invoice flow.
--
-- Accounting: GR debits Inventory/line COA, credits a new GR/IR Clearing
-- liability (default_coa_mappings role 'gr_ir_clearing'). A Return reverses
-- that. The matched Invoice debits GR/IR Clearing (closing the liability)
-- and credits Accounts Payable, same as a normal invoice's AP credit.

-- 1. Purchase Requisitions ---------------------------------------------------

CREATE TABLE purchase_requisitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id       UUID NOT NULL REFERENCES outlets(id),
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'converted')),
  needed_by_date  DATE,
  notes           TEXT,
  requested_by    UUID REFERENCES auth.users(id),
  approved_by     UUID REFERENCES auth.users(id),
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pr_lines (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pr_id    UUID NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
  item_id  UUID NOT NULL REFERENCES item_master(id),
  qty      NUMERIC NOT NULL,
  unit     TEXT,
  notes    TEXT
);

-- 2. Purchase Orders ----------------------------------------------------------

CREATE TABLE purchase_orders (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id      UUID NOT NULL REFERENCES outlets(id),
  pr_id          UUID REFERENCES purchase_requisitions(id),
  vendor_id      UUID REFERENCES vendors(id),
  po_number      TEXT,
  status         TEXT NOT NULL DEFAULT 'draft'
                 CHECK (status IN ('draft', 'pending_approval', 'approved', 'released', 'partially_received', 'received', 'closed', 'cancelled')),
  order_date     DATE,
  expected_date  DATE,
  notes          TEXT,
  created_by     UUID REFERENCES auth.users(id),
  approved_by    UUID REFERENCES auth.users(id),
  approved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE po_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_id         UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id       UUID REFERENCES item_master(id),
  description   TEXT,
  qty           NUMERIC NOT NULL,
  unit          TEXT,
  unit_price    NUMERIC NOT NULL DEFAULT 0,
  total         NUMERIC NOT NULL DEFAULT 0,
  coa_id        UUID REFERENCES chart_of_accounts(id),
  is_inventory  BOOLEAN NOT NULL DEFAULT true,
  received_qty  NUMERIC NOT NULL DEFAULT 0,
  returned_qty  NUMERIC NOT NULL DEFAULT 0
);

-- 3. Goods Receipts -----------------------------------------------------------

CREATE TABLE goods_receipts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     UUID NOT NULL REFERENCES outlets(id),
  po_id         UUID NOT NULL REFERENCES purchase_orders(id),
  receipt_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  status        TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'voided')),
  notes         TEXT,
  received_by   UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE gr_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gr_id         UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  po_line_id    UUID NOT NULL REFERENCES po_lines(id),
  item_id       UUID NOT NULL REFERENCES item_master(id),
  qty_received  NUMERIC NOT NULL,
  unit_cost     NUMERIC NOT NULL,
  notes         TEXT
);

-- 4. Vendor Returns -------------------------------------------------------------

CREATE TABLE vendor_returns (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  outlet_id     UUID NOT NULL REFERENCES outlets(id),
  gr_id         UUID NOT NULL REFERENCES goods_receipts(id),
  return_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  status        TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted')),
  reason        TEXT,
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE return_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id     UUID NOT NULL REFERENCES vendor_returns(id) ON DELETE CASCADE,
  gr_line_id    UUID NOT NULL REFERENCES gr_lines(id),
  item_id       UUID NOT NULL REFERENCES item_master(id),
  qty_returned  NUMERIC NOT NULL,
  unit_cost     NUMERIC NOT NULL
);

-- 5. Additive links on existing tables ----------------------------------------

ALTER TABLE stock_batches ADD COLUMN gr_line_id UUID REFERENCES gr_lines(id);
ALTER TABLE invoices ADD COLUMN po_id UUID REFERENCES purchase_orders(id);

-- Indexes ---------------------------------------------------------------------

CREATE INDEX idx_pr_outlet ON purchase_requisitions(outlet_id);
CREATE INDEX idx_pr_lines_pr ON pr_lines(pr_id);
CREATE INDEX idx_po_outlet ON purchase_orders(outlet_id);
CREATE INDEX idx_po_pr ON purchase_orders(pr_id);
CREATE INDEX idx_po_lines_po ON po_lines(po_id);
CREATE INDEX idx_gr_outlet ON goods_receipts(outlet_id);
CREATE INDEX idx_gr_po ON goods_receipts(po_id);
CREATE INDEX idx_gr_lines_gr ON gr_lines(gr_id);
CREATE INDEX idx_gr_lines_po_line ON gr_lines(po_line_id);
CREATE INDEX idx_returns_outlet ON vendor_returns(outlet_id);
CREATE INDEX idx_returns_gr ON vendor_returns(gr_id);
CREATE INDEX idx_return_lines_return ON return_lines(return_id);
CREATE INDEX idx_stock_batches_gr_line ON stock_batches(gr_line_id);
CREATE INDEX idx_invoices_po ON invoices(po_id);

-- RLS ---------------------------------------------------------------------------
-- Same outlet-join-to-org pattern as invoices/gl_entries. Line tables (no
-- outlet_id of their own) join through their parent, same technique used for
-- disassembly_logs elsewhere in this schema.

ALTER TABLE purchase_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pr_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE po_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE gr_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE return_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Outlet access" ON purchase_requisitions FOR ALL
  USING (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())));

CREATE POLICY "Outlet access" ON pr_lines FOR ALL
  USING (pr_id IN (SELECT id FROM purchase_requisitions WHERE outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))));

CREATE POLICY "Outlet access" ON purchase_orders FOR ALL
  USING (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())));

CREATE POLICY "Outlet access" ON po_lines FOR ALL
  USING (po_id IN (SELECT id FROM purchase_orders WHERE outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))));

CREATE POLICY "Outlet access" ON goods_receipts FOR ALL
  USING (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())));

CREATE POLICY "Outlet access" ON gr_lines FOR ALL
  USING (gr_id IN (SELECT id FROM goods_receipts WHERE outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))));

CREATE POLICY "Outlet access" ON vendor_returns FOR ALL
  USING (outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())));

CREATE POLICY "Outlet access" ON return_lines FOR ALL
  USING (return_id IN (SELECT id FROM vendor_returns WHERE outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))));

-- updated_at triggers -----------------------------------------------------------

CREATE TRIGGER update_purchase_requisitions_updated_at
  BEFORE UPDATE ON purchase_requisitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_purchase_orders_updated_at
  BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RPCs ----------------------------------------------------------------------

-- post_goods_receipt: creates the goods_receipts header + gr_lines, and is
-- the new stock-IN trigger (mirrors post_invoice's stock-IN block exactly,
-- including UOM conversion), crediting GR/IR Clearing instead of AP.
CREATE OR REPLACE FUNCTION post_goods_receipt(
  p_po_id UUID,
  p_outlet_id UUID,
  p_org_id UUID,
  p_receipt_date DATE,
  p_notes TEXT,
  p_lines JSONB
) RETURNS UUID AS $$
DECLARE
  v_gr_id UUID;
  v_gr_ir_coa_id UUID;
  v_gr_line_id UUID;
  v_batch_id UUID;
  line RECORD;
  v_conversion_factor NUMERIC;
  v_converted_qty NUMERIC;
  v_converted_cost NUMERIC;
  v_line_total NUMERIC;
  v_total_amount NUMERIC := 0;
  v_po_line_qty NUMERIC;
  v_po_line_received NUMERIC;
  v_remaining_lines INTEGER;
BEGIN
  SELECT coa_id INTO v_gr_ir_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'gr_ir_clearing';
  IF v_gr_ir_coa_id IS NULL THEN
    RAISE EXCEPTION 'GR/IR Clearing account is not configured in Settings > Accounting.';
  END IF;

  INSERT INTO goods_receipts (outlet_id, po_id, receipt_date, status, notes, received_by)
  VALUES (p_outlet_id, p_po_id, COALESCE(p_receipt_date, CURRENT_DATE), 'posted', p_notes, auth.uid())
  RETURNING id INTO v_gr_id;

  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    po_line_id UUID, item_id UUID, qty_received DECIMAL, unit_cost DECIMAL, coa_id UUID, is_inventory BOOLEAN, notes TEXT
  )
  LOOP
    SELECT qty, received_qty INTO v_po_line_qty, v_po_line_received FROM po_lines WHERE id = line.po_line_id FOR UPDATE;
    IF v_po_line_qty IS NULL THEN
      RAISE EXCEPTION 'PO line % not found', line.po_line_id;
    END IF;
    IF line.qty_received > (v_po_line_qty - v_po_line_received + 0.0001) THEN
      RAISE EXCEPTION 'Cannot receive %: only % remaining on this PO line', line.qty_received, (v_po_line_qty - v_po_line_received);
    END IF;

    v_line_total := line.qty_received * line.unit_cost;
    v_total_amount := v_total_amount + v_line_total;

    INSERT INTO gr_lines (gr_id, po_line_id, item_id, qty_received, unit_cost, notes)
    VALUES (v_gr_id, line.po_line_id, line.item_id, line.qty_received, line.unit_cost, line.notes)
    RETURNING id INTO v_gr_line_id;

    IF COALESCE(line.is_inventory, true) THEN
      SELECT COALESCE(conversion_factor, 1) INTO v_conversion_factor FROM item_master WHERE id = line.item_id;
      IF v_conversion_factor <= 0 THEN v_conversion_factor := 1; END IF;

      v_converted_qty := line.qty_received * v_conversion_factor;
      v_converted_cost := line.unit_cost / v_conversion_factor;

      INSERT INTO stock_batches (outlet_id, item_id, purchase_date, original_qty, qty_remaining, unit_cost, gr_line_id)
      VALUES (p_outlet_id, line.item_id, COALESCE(p_receipt_date, CURRENT_DATE), v_converted_qty, v_converted_qty, v_converted_cost, v_gr_line_id)
      RETURNING id INTO v_batch_id;

      INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
      VALUES (p_outlet_id, line.item_id, 'IN', v_converted_qty, v_converted_cost, v_line_total, 'goods_receipt', v_gr_id);

      INSERT INTO inventory_balance (outlet_id, item_id, qty_on_hand, inventory_value)
      VALUES (p_outlet_id, line.item_id, v_converted_qty, v_line_total)
      ON CONFLICT (outlet_id, item_id)
      DO UPDATE SET
        qty_on_hand = inventory_balance.qty_on_hand + EXCLUDED.qty_on_hand,
        inventory_value = inventory_balance.inventory_value + EXCLUDED.inventory_value,
        updated_at = NOW();
    END IF;

    IF line.coa_id IS NULL THEN
      RAISE EXCEPTION 'COA mapping missing for received line (item %)', line.item_id;
    END IF;

    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, COALESCE(p_receipt_date, CURRENT_DATE), line.coa_id, v_line_total, 0, v_gr_id, 'goods_receipt', 'Goods Receipt');

    UPDATE po_lines SET received_qty = received_qty + line.qty_received WHERE id = line.po_line_id;
  END LOOP;

  INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
  VALUES (p_outlet_id, COALESCE(p_receipt_date, CURRENT_DATE), v_gr_ir_coa_id, 0, v_total_amount, v_gr_id, 'goods_receipt', 'GR/IR Clearing');

  SELECT COUNT(*) INTO v_remaining_lines FROM po_lines WHERE po_id = p_po_id AND received_qty < qty - 0.0001;
  IF v_remaining_lines = 0 THEN
    UPDATE purchase_orders SET status = 'received' WHERE id = p_po_id;
  ELSE
    UPDATE purchase_orders SET status = 'partially_received' WHERE id = p_po_id;
  END IF;

  RETURN v_gr_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- void_goods_receipt: mirrors void_invoice's guard (must be posted, and no
-- stock from it may have been consumed or returned yet).
CREATE OR REPLACE FUNCTION void_goods_receipt(p_gr_id UUID) RETURNS VOID AS $$
DECLARE
  v_status TEXT;
  v_po_id UUID;
  v_unconsumed_check INTEGER;
BEGIN
  SELECT status, po_id INTO v_status, v_po_id FROM goods_receipts WHERE id = p_gr_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Goods receipt not found';
  END IF;
  IF v_status <> 'posted' THEN
    RAISE EXCEPTION 'Only posted goods receipts can be voided';
  END IF;

  SELECT COUNT(*) INTO v_unconsumed_check
  FROM stock_batches sb JOIN gr_lines gl ON gl.id = sb.gr_line_id
  WHERE gl.gr_id = p_gr_id AND sb.qty_remaining < sb.original_qty - 0.0001;
  IF v_unconsumed_check > 0 THEN
    RAISE EXCEPTION 'Cannot void: stock from this receipt has already been consumed or returned';
  END IF;

  UPDATE inventory_balance ib
  SET qty_on_hand = ib.qty_on_hand - sb.original_qty,
      inventory_value = ib.inventory_value - (sb.original_qty * sb.unit_cost),
      updated_at = NOW()
  FROM stock_batches sb JOIN gr_lines gl ON gl.id = sb.gr_line_id
  WHERE gl.gr_id = p_gr_id AND ib.outlet_id = sb.outlet_id AND ib.item_id = sb.item_id;

  UPDATE po_lines pl SET received_qty = pl.received_qty - gl.qty_received
  FROM gr_lines gl WHERE gl.po_line_id = pl.id AND gl.gr_id = p_gr_id;

  DELETE FROM stock_batches WHERE gr_line_id IN (SELECT id FROM gr_lines WHERE gr_id = p_gr_id);
  DELETE FROM stock_ledger WHERE reference_type = 'goods_receipt' AND reference_id = p_gr_id;
  DELETE FROM gl_entries WHERE reference_type = 'goods_receipt' AND reference_id = p_gr_id;
  DELETE FROM gr_lines WHERE gr_id = p_gr_id;

  UPDATE goods_receipts SET status = 'voided' WHERE id = p_gr_id;
  UPDATE purchase_orders SET status = 'released' WHERE id = v_po_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- post_vendor_return: stock-OUT against the specific batch(es) created by
-- named gr_line_id's, with a row-lock + insufficient-remaining guard
-- (mirrors post_production's FIFO-walk guard, scoped to one batch).
CREATE OR REPLACE FUNCTION post_vendor_return(
  p_gr_id UUID,
  p_outlet_id UUID,
  p_org_id UUID,
  p_return_date DATE,
  p_reason TEXT,
  p_lines JSONB
) RETURNS UUID AS $$
DECLARE
  v_return_id UUID;
  v_gr_ir_coa_id UUID;
  line RECORD;
  v_batch RECORD;
  v_line_total NUMERIC;
  v_total_amount NUMERIC := 0;
BEGIN
  SELECT coa_id INTO v_gr_ir_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'gr_ir_clearing';
  IF v_gr_ir_coa_id IS NULL THEN
    RAISE EXCEPTION 'GR/IR Clearing account is not configured in Settings > Accounting.';
  END IF;

  INSERT INTO vendor_returns (outlet_id, gr_id, return_date, status, reason, created_by)
  VALUES (p_outlet_id, p_gr_id, COALESCE(p_return_date, CURRENT_DATE), 'posted', p_reason, auth.uid())
  RETURNING id INTO v_return_id;

  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    gr_line_id UUID, item_id UUID, qty_returned DECIMAL, coa_id UUID
  )
  LOOP
    SELECT * INTO v_batch FROM stock_batches WHERE gr_line_id = line.gr_line_id FOR UPDATE;
    IF v_batch.id IS NULL THEN
      RAISE EXCEPTION 'No stock batch found for GR line %', line.gr_line_id;
    END IF;
    IF v_batch.qty_remaining < line.qty_returned - 0.0001 THEN
      RAISE EXCEPTION 'Cannot return %: only % remaining in stock from this receipt (some may already be consumed)', line.qty_returned, v_batch.qty_remaining;
    END IF;

    UPDATE stock_batches SET qty_remaining = qty_remaining - line.qty_returned WHERE id = v_batch.id;

    INSERT INTO return_lines (return_id, gr_line_id, item_id, qty_returned, unit_cost)
    VALUES (v_return_id, line.gr_line_id, line.item_id, line.qty_returned, v_batch.unit_cost);

    v_line_total := line.qty_returned * v_batch.unit_cost;

    INSERT INTO stock_ledger (outlet_id, item_id, txn_type, qty, unit_cost, total_value, reference_type, reference_id)
    VALUES (p_outlet_id, line.item_id, 'OUT', line.qty_returned, v_batch.unit_cost, v_line_total, 'vendor_return', v_return_id);

    UPDATE inventory_balance
    SET qty_on_hand = qty_on_hand - line.qty_returned,
        inventory_value = inventory_value - v_line_total,
        updated_at = NOW()
    WHERE outlet_id = p_outlet_id AND item_id = line.item_id;

    IF line.coa_id IS NULL THEN
      RAISE EXCEPTION 'COA mapping missing for returned line (item %)', line.item_id;
    END IF;

    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, COALESCE(p_return_date, CURRENT_DATE), line.coa_id, 0, v_line_total, v_return_id, 'vendor_return', 'Vendor Return');

    v_total_amount := v_total_amount + v_line_total;

    UPDATE po_lines pl SET returned_qty = returned_qty + line.qty_returned
    FROM gr_lines gl WHERE gl.id = line.gr_line_id AND pl.id = gl.po_line_id;
  END LOOP;

  INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
  VALUES (p_outlet_id, COALESCE(p_return_date, CURRENT_DATE), v_gr_ir_coa_id, v_total_amount, 0, v_return_id, 'vendor_return', 'GR/IR Clearing Reversal (Return)');

  RETURN v_return_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- post_matched_invoice: the new "3-way match" invoice path. Never touches
-- stock_batches/stock_ledger/inventory_balance — GR already created the
-- stock. Independent of post_invoice; that function is unmodified.
CREATE OR REPLACE FUNCTION post_matched_invoice(
  p_po_id UUID,
  p_outlet_id UUID,
  p_org_id UUID,
  p_vendor_id UUID,
  p_invoice_no TEXT,
  p_invoice_date DATE,
  p_due_date DATE,
  p_lines JSONB,
  p_tax_amount NUMERIC DEFAULT 0,
  p_tax_coa_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_invoice_id UUID;
  v_gr_ir_coa_id UUID;
  v_ap_coa_id UUID;
  v_ppn_coa_id UUID := p_tax_coa_id;
  line RECORD;
  v_subtotal NUMERIC := 0;
  v_total NUMERIC := 0;
BEGIN
  SELECT coa_id INTO v_gr_ir_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'gr_ir_clearing';
  IF v_gr_ir_coa_id IS NULL THEN
    RAISE EXCEPTION 'GR/IR Clearing account is not configured in Settings > Accounting.';
  END IF;

  SELECT coa_id INTO v_ap_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'accounts_payable';
  IF v_ap_coa_id IS NULL THEN
    SELECT id INTO v_ap_coa_id FROM chart_of_accounts WHERE org_id = p_org_id AND code = '2-1-001' LIMIT 1;
  END IF;
  IF v_ap_coa_id IS NULL THEN
    RAISE EXCEPTION 'Accounts Payable account is not configured in Settings > Accounting.';
  END IF;

  IF COALESCE(p_tax_amount, 0) > 0 THEN
    IF v_ppn_coa_id IS NULL THEN
      SELECT coa_id INTO v_ppn_coa_id FROM default_coa_mappings WHERE org_id = p_org_id AND account_role = 'ppn_masukan';
    END IF;
    IF v_ppn_coa_id IS NULL THEN
      RAISE EXCEPTION 'PPN Masukan (Input VAT) account is not configured in Settings > Accounting.';
    END IF;
  END IF;

  INSERT INTO invoices (outlet_id, vendor_id, invoice_no, invoice_date, due_date, po_id, status, subtotal, tax_total, grand_total, currency, created_by, approved_by, approved_at)
  VALUES (p_outlet_id, p_vendor_id, p_invoice_no, p_invoice_date, p_due_date, p_po_id, 'posted', 0, COALESCE(p_tax_amount, 0), 0, 'IDR', auth.uid(), auth.uid(), NOW())
  RETURNING id INTO v_invoice_id;

  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    item_id UUID, description TEXT, qty DECIMAL, unit_price DECIMAL, total DECIMAL, coa_id UUID, is_inventory BOOLEAN
  )
  LOOP
    v_subtotal := v_subtotal + line.total;

    INSERT INTO invoice_lines (invoice_id, item_master_id, description, qty, unit_price, total, coa_id, is_inventory)
    VALUES (v_invoice_id, line.item_id, line.description, line.qty, line.unit_price, line.total, line.coa_id, COALESCE(line.is_inventory, true));

    IF line.coa_id IS NULL THEN
      RAISE EXCEPTION 'COA mapping missing for invoice line: %', COALESCE(line.description, 'Unknown');
    END IF;
  END LOOP;

  v_total := v_subtotal + COALESCE(p_tax_amount, 0);

  INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
  VALUES (p_outlet_id, COALESCE(p_invoice_date, CURRENT_DATE), v_gr_ir_coa_id, v_subtotal, 0, v_invoice_id, 'invoice', 'GR/IR Clearing (Matched Invoice)');

  IF COALESCE(p_tax_amount, 0) > 0 THEN
    INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
    VALUES (p_outlet_id, COALESCE(p_invoice_date, CURRENT_DATE), v_ppn_coa_id, p_tax_amount, 0, v_invoice_id, 'invoice', 'PPN Masukan (Input Tax)');
  END IF;

  INSERT INTO gl_entries (outlet_id, entry_date, coa_id, debit, credit, reference_id, reference_type, description)
  VALUES (p_outlet_id, COALESCE(p_invoice_date, CURRENT_DATE), v_ap_coa_id, 0, v_total, v_invoice_id, 'invoice', 'Purchase Invoice Closing Entry (PO Matched)');

  UPDATE invoices SET subtotal = v_subtotal, grand_total = v_total WHERE id = v_invoice_id;

  RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
