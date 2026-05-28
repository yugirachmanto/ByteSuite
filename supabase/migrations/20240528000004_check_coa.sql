-- Migration to check COA bypassing RLS
CREATE OR REPLACE FUNCTION get_all_ap_coas()
RETURNS TABLE (id UUID, code TEXT, name TEXT, type coa_type, org_id UUID) AS $$
BEGIN
  RETURN QUERY SELECT c.id, c.code, c.name, c.type, c.org_id FROM chart_of_accounts c WHERE c.code LIKE '2-1-%';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
