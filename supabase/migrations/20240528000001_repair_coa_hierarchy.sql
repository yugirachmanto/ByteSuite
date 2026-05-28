-- ============================================================
-- MIGRATION: 20240528000001_repair_coa_hierarchy.sql
-- Implements robust, segment-based parent mapping and rollup repairs.
-- ============================================================

CREATE OR REPLACE FUNCTION public.repair_coa_hierarchy(p_org_id UUID)
RETURNS VOID AS $$
DECLARE
  r RECORD;
  v_parts TEXT[];
  v_p1_code TEXT;
  v_p2_code TEXT;
  v_p3_code TEXT;
  v_parent_id UUID;
BEGIN
  -- 1. Reset all parents to NULL, default level = 1, is_header = false
  UPDATE public.chart_of_accounts 
  SET parent_id = NULL, level = 1, is_header = false
  WHERE org_id = p_org_id;

  -- 2. Scan and set parent_id using segment matching
  FOR r IN 
    SELECT id, code FROM public.chart_of_accounts 
    WHERE org_id = p_org_id
  LOOP
    v_parts := regexp_split_to_array(r.code, '-');
    v_parent_id := NULL;

    IF array_length(v_parts, 1) = 3 THEN
      -- Standard 3-part code (e.g. 1-1-001)
      -- Parent is Group (e.g. 1-1-000 or 1-1-00-000)
      v_p2_code := v_parts[1] || '-' || v_parts[2] || '-000';
      SELECT id INTO v_parent_id FROM public.chart_of_accounts 
      WHERE org_id = p_org_id AND (code = v_p2_code OR code = v_parts[1] || '-' || v_parts[2] || '-00-000') LIMIT 1;
      
      -- Fallback to Class (e.g. 1-0-000 or 1-0-00-000)
      IF v_parent_id IS NULL THEN
        v_p1_code := v_parts[1] || '-0-000';
        SELECT id INTO v_parent_id FROM public.chart_of_accounts 
        WHERE org_id = p_org_id AND (code = v_p1_code OR code = v_parts[1] || '-0-00-000') LIMIT 1;
      END IF;

    ELSIF array_length(v_parts, 1) = 4 THEN
      -- Standard 4-part code (e.g. 1-1-20-010)
      -- Parent is Sub-Group (e.g. 1-1-20-000 or 1-1-20-00-000)
      v_p3_code := v_parts[1] || '-' || v_parts[2] || '-' || v_parts[3] || '-000';
      SELECT id INTO v_parent_id FROM public.chart_of_accounts 
      WHERE org_id = p_org_id AND (code = v_p3_code OR code = v_parts[1] || '-' || v_parts[2] || '-' || v_parts[3] || '-00-000') LIMIT 1;

      -- Fallback to Group (e.g. 1-1-00-000 or 1-1-000)
      IF v_parent_id IS NULL THEN
        v_p2_code := v_parts[1] || '-' || v_parts[2] || '-000';
        SELECT id INTO v_parent_id FROM public.chart_of_accounts 
        WHERE org_id = p_org_id AND (code = v_p2_code OR code = v_parts[1] || '-' || v_parts[2] || '-00-000') LIMIT 1;
      END IF;
    END IF;

    -- Link parent
    IF v_parent_id IS NOT NULL THEN
      UPDATE public.chart_of_accounts SET parent_id = v_parent_id WHERE id = r.id;
    END IF;
  END LOOP;

  -- 3. Update is_header flags based on actual children
  UPDATE public.chart_of_accounts
  SET is_header = true
  WHERE org_id = p_org_id
    AND id IN (
      SELECT DISTINCT parent_id 
      FROM public.chart_of_accounts 
      WHERE org_id = p_org_id AND parent_id IS NOT NULL
    );

  -- 4. Calculate levels recursively
  WITH RECURSIVE coa_levels AS (
    SELECT id, 1 AS calculated_level
    FROM public.chart_of_accounts
    WHERE org_id = p_org_id AND parent_id IS NULL

    UNION ALL

    SELECT child.id, parent.calculated_level + 1
    FROM public.chart_of_accounts child
    JOIN coa_levels parent ON child.parent_id = parent.id
    WHERE child.org_id = p_org_id
  )
  UPDATE public.chart_of_accounts c
  SET level = l.calculated_level
  FROM coa_levels l
  WHERE c.id = l.id AND c.org_id = p_org_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.repair_coa_hierarchy(UUID) TO authenticated;
