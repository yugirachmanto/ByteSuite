-- Broaden gl_entries access to anyone in the same organization
-- This ensures that if you have access to the org, you can see all GL entries for all its outlets
DROP POLICY IF EXISTS "Outlet access" ON gl_entries;
DROP POLICY IF EXISTS "Org access for GL" ON gl_entries;

CREATE POLICY "Org access for GL" ON gl_entries
  FOR ALL USING (
    outlet_id IN (
      SELECT o.id FROM outlets o
      JOIN user_profiles up ON up.org_id = o.org_id
      WHERE up.id = auth.uid()
    )
  );

-- Also ensure chart_of_accounts has a solid org policy
DROP POLICY IF EXISTS "Org access" ON chart_of_accounts;
CREATE POLICY "Org access" ON chart_of_accounts
  FOR ALL USING (
    org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid())
  );
