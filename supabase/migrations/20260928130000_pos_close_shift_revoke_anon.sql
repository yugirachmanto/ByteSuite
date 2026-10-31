-- close_pos_shift is SECURITY DEFINER and its caller check is
--   IF auth.uid() <> v_cashier_id AND v_caller_role NOT IN ('owner','admin')
-- which evaluates to NULL (not true) when auth.uid() IS NULL, so an
-- unauthenticated caller holding only the public anon key could close any
-- open shift by id. Close it at the door: no anon/PUBLIC execute.
--
-- (A wider audit of other SECURITY DEFINER RPCs that anon can execute is
-- tracked separately; this migration only touches the function the refund
-- work modified.)

REVOKE ALL ON FUNCTION public.close_pos_shift(UUID, NUMERIC, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.close_pos_shift(UUID, NUMERIC, TEXT) TO authenticated, service_role;
