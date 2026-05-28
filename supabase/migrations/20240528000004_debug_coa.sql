-- Check if 2-1-10-010 exists across the database regardless of RLS
CREATE OR REPLACE FUNCTION get_coa_debug()
RETURNS TABLE (id UUID, code TEXT, name TEXT, type coa_type, org_id UUID, is_header BOOLEAN) AS $$
BEGIN
  RETURN QUERY SELECT c.id, c.code, c.name, c.type, c.org_id, c.is_header FROM chart_of_accounts c WHERE c.code LIKE '2-1-10-%';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
