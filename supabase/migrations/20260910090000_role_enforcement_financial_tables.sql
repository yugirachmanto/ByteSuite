-- Fase 2: role-aware RLS for the 8 core financial tables. Every one of
-- them currently has a single "FOR ALL" policy scoped only by org_id/
-- outlet_id — any authenticated org member (cashier, kitchen included)
-- can write directly to gl_entries, chart_of_accounts, purchase_orders,
-- etc. via a direct API call, bypassing every button/guard in the UI.
--
-- Almost every real write to these tables already goes through a
-- SECURITY DEFINER RPC (post_invoice, post_goods_receipt, post_production,
-- ...) which runs with the function owner's privileges and bypasses RLS
-- entirely — so tightening RLS here cannot break any of those flows. This
-- migration closes the direct-client-write gap found by grep: manual
-- journal entries (gl_entries), COA management (chart_of_accounts),
-- invoice delete/upload/review (invoices), PR/PO approve/release
-- (purchase_requisitions/purchase_orders), and the cascading stock_batches
-- delete on invoice removal.

-- ============================================================
-- gl_entries — write: owner/admin/finance (manual journal entries)
-- ============================================================
DROP POLICY IF EXISTS "Org access for GL" ON gl_entries;

CREATE POLICY "GL select" ON gl_entries FOR SELECT USING (
  outlet_id IN (SELECT o.id FROM outlets o JOIN user_profiles up ON up.org_id = o.org_id WHERE up.id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance','viewer')
);
CREATE POLICY "GL insert" ON gl_entries FOR INSERT WITH CHECK (
  outlet_id IN (SELECT o.id FROM outlets o JOIN user_profiles up ON up.org_id = o.org_id WHERE up.id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
CREATE POLICY "GL update" ON gl_entries FOR UPDATE USING (
  outlet_id IN (SELECT o.id FROM outlets o JOIN user_profiles up ON up.org_id = o.org_id WHERE up.id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
CREATE POLICY "GL delete" ON gl_entries FOR DELETE USING (
  outlet_id IN (SELECT o.id FROM outlets o JOIN user_profiles up ON up.org_id = o.org_id WHERE up.id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);

-- ============================================================
-- chart_of_accounts — write: owner/admin only (COA structure/setup)
-- ============================================================
DROP POLICY IF EXISTS "Org access" ON chart_of_accounts;

CREATE POLICY "COA select" ON chart_of_accounts FOR SELECT USING (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance','viewer')
);
CREATE POLICY "COA insert" ON chart_of_accounts FOR INSERT WITH CHECK (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin')
);
CREATE POLICY "COA update" ON chart_of_accounts FOR UPDATE USING (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin')
);
CREATE POLICY "COA delete" ON chart_of_accounts FOR DELETE USING (
  org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin')
);

-- ============================================================
-- invoices — write: owner/admin/finance
-- ============================================================
DROP POLICY IF EXISTS "Outlet access" ON invoices;

CREATE POLICY "Invoices select" ON invoices FOR SELECT USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance','viewer')
);
CREATE POLICY "Invoices insert" ON invoices FOR INSERT WITH CHECK (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
CREATE POLICY "Invoices update" ON invoices FOR UPDATE USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
CREATE POLICY "Invoices delete" ON invoices FOR DELETE USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);

-- ============================================================
-- purchase_orders — write: owner/admin/finance
-- ============================================================
DROP POLICY IF EXISTS "Outlet access" ON purchase_orders;

CREATE POLICY "PO select" ON purchase_orders FOR SELECT USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance','viewer')
);
CREATE POLICY "PO insert" ON purchase_orders FOR INSERT WITH CHECK (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
CREATE POLICY "PO update" ON purchase_orders FOR UPDATE USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
CREATE POLICY "PO delete" ON purchase_orders FOR DELETE USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);

-- ============================================================
-- purchase_requisitions — write: owner/admin/finance
-- ============================================================
DROP POLICY IF EXISTS "Outlet access" ON purchase_requisitions;

CREATE POLICY "PR select" ON purchase_requisitions FOR SELECT USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance','viewer')
);
CREATE POLICY "PR insert" ON purchase_requisitions FOR INSERT WITH CHECK (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
CREATE POLICY "PR update" ON purchase_requisitions FOR UPDATE USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
CREATE POLICY "PR delete" ON purchase_requisitions FOR DELETE USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);

-- ============================================================
-- goods_receipts — write: owner/admin/finance
-- ============================================================
DROP POLICY IF EXISTS "Outlet access" ON goods_receipts;

CREATE POLICY "GR select" ON goods_receipts FOR SELECT USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance','viewer')
);
CREATE POLICY "GR insert" ON goods_receipts FOR INSERT WITH CHECK (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
CREATE POLICY "GR update" ON goods_receipts FOR UPDATE USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
CREATE POLICY "GR delete" ON goods_receipts FOR DELETE USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);

-- ============================================================
-- vendor_returns — write: owner/admin/finance
-- ============================================================
DROP POLICY IF EXISTS "Outlet access" ON vendor_returns;

CREATE POLICY "VR select" ON vendor_returns FOR SELECT USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance','viewer')
);
CREATE POLICY "VR insert" ON vendor_returns FOR INSERT WITH CHECK (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
CREATE POLICY "VR update" ON vendor_returns FOR UPDATE USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
CREATE POLICY "VR delete" ON vendor_returns FOR DELETE USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);

-- ============================================================
-- stock_batches — write: owner/admin/finance (direct writes only —
-- production/opname/GR go through SECURITY DEFINER RPCs, unaffected)
-- ============================================================
DROP POLICY IF EXISTS "Outlet access" ON stock_batches;

CREATE POLICY "Stock batches select" ON stock_batches FOR SELECT USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance','viewer')
);
CREATE POLICY "Stock batches insert" ON stock_batches FOR INSERT WITH CHECK (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
CREATE POLICY "Stock batches update" ON stock_batches FOR UPDATE USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
CREATE POLICY "Stock batches delete" ON stock_batches FOR DELETE USING (
  outlet_id IN (SELECT id FROM outlets WHERE org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()))
  AND (SELECT role FROM user_profiles WHERE id = auth.uid())::text IN ('owner','admin','finance')
);
