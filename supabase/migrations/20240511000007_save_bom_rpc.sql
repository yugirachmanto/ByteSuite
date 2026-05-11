-- Create a security definer function to handle BOM saves
-- This bypasses RLS issues and ensures atomic transactions

CREATE OR REPLACE FUNCTION save_bom(
  p_output_item_id UUID,
  p_lines JSONB
) RETURNS VOID AS $$
DECLARE
  v_org_id UUID;
  line     RECORD;
BEGIN
  -- 1. Resolve org_id from the authenticated user's profile
  SELECT org_id INTO v_org_id 
  FROM public.user_profiles 
  WHERE id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'User organization not found';
  END IF;

  -- 2. Validate that the output item belongs to the same organization
  IF NOT EXISTS (
    SELECT 1 FROM item_master 
    WHERE id = p_output_item_id AND org_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Access denied to the target item';
  END IF;

  -- 3. Delete existing BOM lines for this item
  DELETE FROM public.bom WHERE output_item_id = p_output_item_id;

  -- 4. Insert new BOM lines
  FOR line IN SELECT * FROM jsonb_to_recordset(p_lines) AS x(
    input_item_id UUID,
    qty_per_unit NUMERIC,
    unit TEXT
  )
  LOOP
    -- Only insert if valid
    IF line.input_item_id IS NOT NULL AND line.qty_per_unit > 0 THEN
      INSERT INTO public.bom (org_id, output_item_id, input_item_id, qty_per_unit, unit)
      VALUES (v_org_id, p_output_item_id, line.input_item_id, line.qty_per_unit, COALESCE(line.unit, 'pcs'));
    END IF;
  END LOOP;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
