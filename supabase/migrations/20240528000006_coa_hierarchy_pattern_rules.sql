-- ============================================================
-- MIGRATION: 20240528000006_coa_hierarchy_pattern_rules.sql
-- Implements pattern-based hierarchy detection and building for COA
-- ============================================================

-- Step 1: Add columns (IF NOT EXISTS)
ALTER TABLE chart_of_accounts
  ADD COLUMN IF NOT EXISTS level     integer NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS is_header boolean NOT NULL DEFAULT false;
  -- parent_id already exists from earlier migrations

-- Step 2: Backfill level and is_header based on code pattern
UPDATE chart_of_accounts
SET
  level = CASE
    -- 1-0-00-000 pattern: part2=0, part3=00, part4=000
    WHEN split_part(code, '-', 2) = '0'
     AND split_part(code, '-', 3) = '00'
     AND split_part(code, '-', 4) = '000' THEN 1

    -- 1-1-00-000 pattern: part3=00, part4=000
    WHEN split_part(code, '-', 3) = '00'
     AND split_part(code, '-', 4) = '000' THEN 2

    -- 1-1-10-000 pattern: part4=000 only
    WHEN split_part(code, '-', 4) = '000' THEN 3

    -- everything else is a leaf
    ELSE 4
  END,
  is_header = CASE
    WHEN split_part(code, '-', 4) = '000' THEN true
    ELSE false
  END;

-- Step 3: Backfill parent_id based on code pattern matching

-- Nullify existing parent_ids first to ensure a clean slate
UPDATE chart_of_accounts SET parent_id = NULL;

-- Level 4 → parent is Level 3 (replace part4 with 000)
UPDATE chart_of_accounts child
SET parent_id = parent.id
FROM chart_of_accounts parent
WHERE child.org_id = parent.org_id
  AND child.level = 4
  AND parent.code = split_part(child.code, '-', 1) || '-'
                 || split_part(child.code, '-', 2) || '-'
                 || split_part(child.code, '-', 3) || '-000';

-- Level 3 → parent is Level 2 (replace part3+part4 with 00-000)
UPDATE chart_of_accounts child
SET parent_id = parent.id
FROM chart_of_accounts parent
WHERE child.org_id = parent.org_id
  AND child.level = 3
  AND parent.code = split_part(child.code, '-', 1) || '-'
                 || split_part(child.code, '-', 2) || '-00-000';

-- Level 2 → parent is Level 1 (replace part2+part3+part4 with 0-00-000)
UPDATE chart_of_accounts child
SET parent_id = parent.id
FROM chart_of_accounts parent
WHERE child.org_id = parent.org_id
  AND child.level = 2
  AND parent.code = split_part(child.code, '-', 1) || '-0-00-000';

-- Step 4: Recreate get_coa_balance_tree to use recursive parent_id traversal
CREATE OR REPLACE FUNCTION get_coa_balance_tree(
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
LANGUAGE sql STABLE AS $$

WITH

-- Step A: Get direct GL balances for leaf accounts only
leaf_balances AS (
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

-- Step B: Attach leaf balances to COA tree
coa_with_balance AS (
  SELECT
    c.id,
    c.code,
    c.name,
    c.level,
    c.is_header,
    c.parent_id,
    c.type,
    COALESCE(lb.total_debit,  0) AS total_debit,
    COALESCE(lb.total_credit, 0) AS total_credit
  FROM chart_of_accounts c
  LEFT JOIN leaf_balances lb ON lb.coa_id = c.id
  WHERE c.org_id = p_org_id
),

-- Step C: Walk DOWN the tree from each node to sum all leaf descendants
-- For every node, find all leaf accounts that are its descendants
rollup AS (
  SELECT
    parent.id         AS coa_id,
    parent.code       AS coa_code,
    parent.name       AS coa_name,
    parent.level,
    parent.is_header,
    parent.parent_id,
    parent.type,
    SUM(leaf.total_debit)  AS total_debit,
    SUM(leaf.total_credit) AS total_credit
  FROM coa_with_balance parent
  -- Join to all leaf descendants via recursive ancestor path
  JOIN (
    WITH RECURSIVE descendants AS (
      -- Base: every leaf account and its own id
      SELECT id AS leaf_id, id AS ancestor_id
      FROM coa_with_balance
      WHERE is_header = false

      UNION ALL

      -- Recursive: walk up to parent
      SELECT d.leaf_id, c.parent_id AS ancestor_id
      FROM descendants d
      JOIN coa_with_balance c ON c.id = d.ancestor_id
      WHERE c.parent_id IS NOT NULL
    )
    SELECT leaf_id, ancestor_id FROM descendants
  ) ancestry ON ancestry.ancestor_id = parent.id
  JOIN coa_with_balance leaf ON leaf.id = ancestry.leaf_id
  GROUP BY
    parent.id, parent.code, parent.name,
    parent.level, parent.is_header, parent.parent_id, parent.type
)

-- Step D: Return with correct balance direction per account type
SELECT
  r.coa_id,
  r.coa_code,
  r.coa_name,
  r.level AS coa_level,
  r.is_header,
  r.parent_id,
  r.total_debit,
  r.total_credit,
  CASE r.type
    WHEN 'asset'     THEN r.total_debit - r.total_credit
    WHEN 'expense'   THEN r.total_debit - r.total_credit
    WHEN 'liability' THEN r.total_credit - r.total_debit
    WHEN 'equity'    THEN r.total_credit - r.total_debit
    WHEN 'income'    THEN r.total_credit - r.total_debit
    ELSE                  r.total_debit - r.total_credit
  END AS balance
FROM rollup r
ORDER BY r.coa_code;

$$;

-- Step 5: Enforce leaf-only posting
CREATE OR REPLACE FUNCTION check_coa_is_leaf()
RETURNS trigger AS $$
BEGIN
  IF (SELECT is_header FROM chart_of_accounts WHERE id = NEW.coa_id) = true THEN
    RAISE EXCEPTION 'COA % is a header account and cannot receive GL entries.',
      (SELECT code FROM chart_of_accounts WHERE id = NEW.coa_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS enforce_leaf_posting ON gl_entries;
CREATE TRIGGER enforce_leaf_posting
  BEFORE INSERT ON gl_entries
  FOR EACH ROW EXECUTE FUNCTION check_coa_is_leaf();
