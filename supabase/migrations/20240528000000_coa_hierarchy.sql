-- ============================================================
-- MIGRATION: 20240528000000_coa_hierarchy.sql
-- Implements hierarchical COA schema, backfill, RPC, and posting guards.
-- Safe to re-run: uses IF NOT EXISTS, OR REPLACE, DROP IF EXISTS.
-- ============================================================

-- ─── 1. Schema Alterations ────────────────────────────────────────────────────
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS level     integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_header boolean NOT NULL DEFAULT false;


-- ─── 2. Dynamic Hierarchy Level & Header Flagging ────────────────────────────
-- Flags accounts that have children as headers, and calculates their depth levels
-- recursively based on the existing parent_id structures already in settings.
-- This guarantees zero changes to your existing COA codes or names.

-- A. Set is_header = true for any account that has children
UPDATE chart_of_accounts
SET is_header = true
WHERE id IN (
  SELECT DISTINCT parent_id 
  FROM chart_of_accounts 
  WHERE parent_id IS NOT NULL
);

-- B. Set is_header = false for leaf accounts (those with no children)
UPDATE chart_of_accounts
SET is_header = false
WHERE id NOT IN (
  SELECT DISTINCT parent_id 
  FROM chart_of_accounts 
  WHERE parent_id IS NOT NULL
);

-- C. Calculate level recursively using a CTE based on the existing hierarchy
WITH RECURSIVE coa_levels AS (
  -- Base case: root nodes (parent_id IS NULL) are level 1
  SELECT id, 1 AS calculated_level
  FROM chart_of_accounts
  WHERE parent_id IS NULL

  UNION ALL

  -- Recursive case: child's level is parent's level + 1
  SELECT child.id, parent.calculated_level + 1
  FROM chart_of_accounts child
  JOIN coa_levels parent ON child.parent_id = parent.id
)
UPDATE chart_of_accounts c
SET level = l.calculated_level
FROM coa_levels l
WHERE c.id = l.id;


-- ─── 3. Recursive Balance Rollup RPC ─────────────────────────────────────────
-- Chosen: Option A — pure SQL rollup via recursive CTE (tree_path).
-- Every leaf's debit/credit is propagated up to ALL its ancestors.
-- Header rows automatically show the sum of all their leaf descendants.
-- No frontend rollup logic required.
CREATE OR REPLACE FUNCTION public.get_coa_balance_tree(
  p_org_id    uuid,
  p_date_from date,
  p_date_to   date
)
RETURNS TABLE (
  coa_id       uuid,
  coa_code     text,
  coa_name     text,
  coa_level    integer,
  is_header    boolean,
  parent_id    uuid,
  total_debit  numeric,
  total_credit numeric,
  balance      numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE coa_tree AS (
    -- All COAs for this org
    SELECT
      c.id,
      c.code,
      c.name,
      c.level,
      c.is_header,
      c.parent_id,
      c.type AS account_type
    FROM chart_of_accounts c
    WHERE c.org_id = p_org_id
  ),
  leaf_balances AS (
    -- GL balances for leaf accounts only, within date range
    SELECT
      g.coa_id,
      SUM(g.debit)  AS total_debit,
      SUM(g.credit) AS total_credit
    FROM gl_entries g
    JOIN outlets o ON o.id = g.outlet_id
    WHERE o.org_id = p_org_id
      AND g.entry_date BETWEEN p_date_from AND p_date_to
    GROUP BY g.coa_id
  ),
  -- Recursive CTE: propagates each account balance up through all ancestors
  tree_path AS (
    -- Base: each account points to itself (regardless of is_header to support legacy postings)
    SELECT
      c.id AS leaf_id,
      c.id AS ancestor_id,
      c.parent_id
    FROM coa_tree c

    UNION ALL

    -- Recursive: walk up to parent
    SELECT
      tp.leaf_id,
      c.id AS ancestor_id,
      c.parent_id
    FROM tree_path tp
    JOIN coa_tree c ON c.id = tp.parent_id
  ),
  rolled_up_balances AS (
    -- Aggregate leaf balances into every ancestor (including the leaf itself)
    SELECT
      tp.ancestor_id                          AS coa_id,
      SUM(COALESCE(lb.total_debit,  0))       AS total_debit,
      SUM(COALESCE(lb.total_credit, 0))       AS total_credit
    FROM tree_path tp
    LEFT JOIN leaf_balances lb ON lb.coa_id = tp.leaf_id
    GROUP BY tp.ancestor_id
  )
  -- Final: join rolled-up balances back to COA metadata, apply balance direction
  SELECT
    c.id                              AS coa_id,
    c.code                            AS coa_code,
    c.name                            AS coa_name,
    c.level                           AS coa_level,
    c.is_header,
    c.parent_id,
    COALESCE(r.total_debit,  0)       AS total_debit,
    COALESCE(r.total_credit, 0)       AS total_credit,
    CASE c.account_type
      WHEN 'asset'     THEN COALESCE(r.total_debit, 0) - COALESCE(r.total_credit, 0)
      WHEN 'expense'   THEN COALESCE(r.total_debit, 0) - COALESCE(r.total_credit, 0)
      WHEN 'liability' THEN COALESCE(r.total_credit, 0) - COALESCE(r.total_debit, 0)
      WHEN 'equity'    THEN COALESCE(r.total_credit, 0) - COALESCE(r.total_debit, 0)
      WHEN 'income'    THEN COALESCE(r.total_credit, 0) - COALESCE(r.total_debit, 0)
      ELSE COALESCE(r.total_debit, 0) - COALESCE(r.total_credit, 0)
    END                               AS balance
  FROM coa_tree c
  LEFT JOIN rolled_up_balances r ON r.coa_id = c.id
  ORDER BY c.code;
END;
$$;

-- Grant to authenticated users
GRANT EXECUTE ON FUNCTION public.get_coa_balance_tree(uuid, date, date) TO authenticated;


-- ─── 4. Leaf-Posting Guard Trigger ───────────────────────────────────────────
-- Raises exception if any GL entry is posted to a header (non-leaf) account.
CREATE OR REPLACE FUNCTION public.check_coa_is_leaf()
RETURNS trigger AS $$
DECLARE
  v_is_header boolean;
  v_code      text;
BEGIN
  SELECT is_header, code INTO v_is_header, v_code
  FROM chart_of_accounts WHERE id = NEW.coa_id;

  IF v_is_header = true THEN
    RAISE EXCEPTION
      'COA "%" (id: %) is a header account and cannot receive GL entries. Use a leaf account.',
      v_code, NEW.coa_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_leaf_posting ON gl_entries;
CREATE TRIGGER enforce_leaf_posting
  BEFORE INSERT ON gl_entries
  FOR EACH ROW EXECUTE FUNCTION public.check_coa_is_leaf();
