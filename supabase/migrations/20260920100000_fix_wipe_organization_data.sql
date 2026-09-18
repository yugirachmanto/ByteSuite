-- wipe_organization_data was last updated in 20240528000005, long before the
-- purchasing workflow (PR/PO/GR/Invoice/Return), native POS (orders/shifts),
-- disassembly, and AR/customer-invoicing modules existed. Any org that used
-- those features hit a foreign key violation on this RPC (reported: deleting
-- item_master failed on pr_lines_item_id_fkey, since pr_lines was never
-- cleared). This is a full rewrite covering every table now reachable from
-- item_master/chart_of_accounts/outlets, in correct child-before-parent order.
--
-- Scope intentionally matches what /settings/system already documents as
-- "deleted" vs "preserved": outlets, vendors, customers, user profiles, and
-- org metadata are left alone; every transactional/catalog/GL table is wiped.
-- tenant_invoices (the SaaS billing history for this org as a ByteSuite
-- customer, managed by the admin panel — not this org's own AP invoices) is
-- deliberately NOT wiped; only its now-dangling COA references are nulled.
CREATE OR REPLACE FUNCTION wipe_organization_data(p_org_id UUID)
RETURNS VOID AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  -- 1. Security Gate: Verify caller is owner of the targeted organization
  SELECT role INTO v_caller_role
  FROM public.user_profiles
  WHERE id = auth.uid() AND org_id = p_org_id;

  IF v_caller_role IS NULL OR v_caller_role != 'owner' THEN
    RAISE EXCEPTION 'Access Denied: Only the organization owner can perform a System Reset.';
  END IF;

  -- 2. Execute deletion in clean reverse-dependency order to satisfy all foreign keys

  -- A. Deepest leaves — lines/items that reference logs/headers deleted further down
  DELETE FROM public.stock_batches WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);
  DELETE FROM public.disassembly_log_items WHERE log_id IN (
    SELECT id FROM public.disassembly_logs WHERE parent_item_id IN (SELECT id FROM public.item_master WHERE org_id = p_org_id)
  );
  DELETE FROM public.return_lines WHERE gr_line_id IN (
    SELECT id FROM public.gr_lines WHERE gr_id IN (SELECT id FROM public.goods_receipts WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id))
  );
  DELETE FROM public.pos_order_lines WHERE order_id IN (SELECT id FROM public.pos_orders WHERE org_id = p_org_id);
  DELETE FROM public.pos_order_payments WHERE order_id IN (SELECT id FROM public.pos_orders WHERE org_id = p_org_id);
  DELETE FROM public.customer_invoice_lines WHERE invoice_id IN (
    SELECT id FROM public.customer_invoices WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id)
  );
  DELETE FROM public.ar_payments WHERE org_id = p_org_id;
  DELETE FROM public.waste_log WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);

  -- B. Logs, inventory state, and legacy POS CSV-import staging tables
  DELETE FROM public.opname_log WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);
  DELETE FROM public.production_log WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);
  DELETE FROM public.inventory_balance WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);
  DELETE FROM public.stock_ledger WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);
  -- pos_journal_summaries / pos_payment_summaries are VIEWs derived from
  -- pos_import_lines (no storage of their own) — clearing the line rows
  -- below is sufficient, nothing to DELETE here.
  DELETE FROM public.pos_import_lines WHERE org_id = p_org_id;
  DELETE FROM public.pos_imports WHERE org_id = p_org_id;

  -- C. Disassembly (log items already gone; logs and templates both key off item_master)
  DELETE FROM public.disassembly_logs WHERE parent_item_id IN (SELECT id FROM public.item_master WHERE org_id = p_org_id);
  DELETE FROM public.disassembly_templates WHERE parent_item_id IN (SELECT id FROM public.item_master WHERE org_id = p_org_id);

  -- D. Purchasing workflow receipts/returns, native POS orders/shifts, AR invoices
  DELETE FROM public.gr_lines WHERE gr_id IN (SELECT id FROM public.goods_receipts WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id));
  DELETE FROM public.vendor_returns WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);
  DELETE FROM public.pos_orders WHERE org_id = p_org_id;
  DELETE FROM public.pos_shifts WHERE org_id = p_org_id;
  DELETE FROM public.customer_invoices WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);
  DELETE FROM public.goods_receipts WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);

  -- E. AP Invoices & Lines
  DELETE FROM public.invoice_lines WHERE invoice_id IN (SELECT id FROM public.invoices WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id));
  DELETE FROM public.invoice_lines WHERE coa_id IN (SELECT id FROM public.chart_of_accounts WHERE org_id = p_org_id);
  DELETE FROM public.invoices WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);

  -- F. Purchase Orders & Purchase Requisitions
  DELETE FROM public.po_lines WHERE po_id IN (SELECT id FROM public.purchase_orders WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id));
  DELETE FROM public.purchase_orders WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);
  DELETE FROM public.pr_lines WHERE pr_id IN (SELECT id FROM public.purchase_requisitions WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id));
  DELETE FROM public.purchase_requisitions WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);

  -- G. AP payments
  DELETE FROM public.ap_payments WHERE org_id = p_org_id;

  -- H. Catalog Setup
  DELETE FROM public.bom WHERE org_id = p_org_id;
  DELETE FROM public.product_prices WHERE org_id = p_org_id;
  DELETE FROM public.item_master WHERE org_id = p_org_id;

  -- I. Break this org's tenant-billing rows' references to the COA about to be
  -- wiped, without touching the billing rows themselves (SaaS layer, owned by
  -- the admin panel, not "this org's own business data").
  UPDATE public.tenant_invoices SET payment_expense_coa_id = NULL, payment_asset_coa_id = NULL WHERE org_id = p_org_id;

  -- J. Account Configurations & Integrations
  DELETE FROM public.pos_coa_mapping WHERE org_id = p_org_id;
  DELETE FROM public.pos_payment_method_mapping WHERE org_id = p_org_id;
  DELETE FROM public.default_coa_mappings WHERE org_id = p_org_id;
  DELETE FROM public.pph_rules WHERE org_id = p_org_id;
  DELETE FROM public.user_integrations WHERE org_id = p_org_id;

  -- K. General Ledger (before COA, to satisfy gl_entries.coa_id)
  DELETE FROM public.gl_entries WHERE outlet_id IN (SELECT id FROM public.outlets WHERE org_id = p_org_id);
  DELETE FROM public.gl_entries WHERE coa_id IN (SELECT id FROM public.chart_of_accounts WHERE org_id = p_org_id);

  -- L. Chart of Accounts (nullify parent self-references first)
  UPDATE public.chart_of_accounts SET parent_id = NULL WHERE org_id = p_org_id;
  DELETE FROM public.chart_of_accounts WHERE org_id = p_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
