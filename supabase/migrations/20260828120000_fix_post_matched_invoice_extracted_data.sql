-- Fix post_matched_invoice: the existing /invoices/[id]/review page only ever
-- hydrates its line-items UI from invoice.extracted_data.line_items — it
-- never re-reads the invoice_lines table (that table is normally only
-- populated by post_invoice AT post time, after review). A matched invoice
-- is created already-posted with real invoice_lines rows but no
-- extracted_data, so the review page rendered a blank line-items table and
-- Rp 0 totals despite the underlying data being fully correct (confirmed via
-- direct query during verification). Populating extracted_data in the same
-- shape the AI extraction produces makes the existing page render matched
-- invoices correctly with no changes to that page itself.

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
  v_vendor_name TEXT;
  line RECORD;
  v_subtotal NUMERIC := 0;
  v_total NUMERIC := 0;
  v_extracted_lines JSONB := '[]'::jsonb;
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

  SELECT name INTO v_vendor_name FROM vendors WHERE id = p_vendor_id;

  INSERT INTO invoices (outlet_id, vendor_id, vendor, invoice_no, invoice_date, due_date, po_id, status, subtotal, tax_total, grand_total, currency, created_by, approved_by, approved_at)
  VALUES (p_outlet_id, p_vendor_id, v_vendor_name, p_invoice_no, p_invoice_date, p_due_date, p_po_id, 'posted', 0, COALESCE(p_tax_amount, 0), 0, 'IDR', auth.uid(), auth.uid(), NOW())
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

    v_extracted_lines := v_extracted_lines || jsonb_build_object(
      'item_master_id', line.item_id,
      'description', line.description,
      'qty', line.qty,
      'unit_price', line.unit_price,
      'total', line.total,
      'coa_id', line.coa_id,
      'is_inventory', COALESCE(line.is_inventory, true),
      'match_source', 'po_match'
    );
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

  UPDATE invoices SET
    subtotal = v_subtotal,
    grand_total = v_total,
    extracted_data = jsonb_build_object(
      'vendor', v_vendor_name,
      'invoice_no', p_invoice_no,
      'invoice_date', p_invoice_date,
      'line_items', v_extracted_lines,
      'subtotal', v_subtotal,
      'tax_total', COALESCE(p_tax_amount, 0),
      'grand_total', v_total
    )
  WHERE id = v_invoice_id;

  RETURN v_invoice_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
