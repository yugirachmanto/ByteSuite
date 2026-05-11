-- Final attempt to fix BOM RLS policies
-- Use a more direct equality check and ensure ALL operations are covered correctly

ALTER TABLE bom ENABLE ROW LEVEL SECURITY;

-- Clear previous attempts
DROP POLICY IF EXISTS "Org access" ON bom;
DROP POLICY IF EXISTS "bom_select_policy" ON bom;
DROP POLICY IF EXISTS "bom_insert_policy" ON bom;
DROP POLICY IF EXISTS "bom_update_policy" ON bom;
DROP POLICY IF EXISTS "bom_delete_policy" ON bom;

-- Use a single policy for ALL operations if possible, or separate them for clarity
-- This time we use a subquery that is common in many Supabase starters

CREATE POLICY "bom_management_policy" ON bom
  FOR ALL 
  TO authenticated
  USING (
    org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid())
  );
