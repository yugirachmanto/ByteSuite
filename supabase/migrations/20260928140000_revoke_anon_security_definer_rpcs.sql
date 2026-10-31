-- Close the anon door on SECURITY DEFINER RPCs.
--
-- Postgres grants EXECUTE on new functions to PUBLIC by default, and the
-- public anon key ships in every browser bundle, so any SECURITY DEFINER
-- function in the public schema was callable over REST by someone who is not
-- logged in. Audit (2026-10-31): 18 of them do not check the caller at all
-- (process_pos_order, void_invoice, void_goods_receipt, repost_pending_pos_gl,
-- bulk_create_products, bulk_import_bom, import_beginning_balance,
-- repair_coa_hierarchy, preview_*, validate_pos_import, ...) and several
-- others only reference auth.uid() for audit columns.
--
-- Fix at the door: no EXECUTE for PUBLIC/anon; keep authenticated (what the
-- app uses) and service_role (server routes/cron). Left open on purpose:
--   get_public_careers / get_public_job  - public career pages (read-only, public columns)
--   register_new_org                      - called from /register before an email-confirmed session exists
-- Trigger / event-trigger functions are skipped (execute rights are not
-- checked when a trigger fires, and they are not callable over REST).
--
-- NOT fixed here (follow-up): the NO-AUTH functions still trust the
-- org_id/outlet_id passed by any LOGGED-IN caller, so a user of org A who
-- knows an org B id could call them. They need in-function org/role checks.

DO $$
DECLARE
  f RECORD;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig,
           has_function_privilege('authenticated', p.oid, 'execute') AS auth_had
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'execute')
      AND p.proname NOT IN ('get_public_careers', 'get_public_job', 'register_new_org')
      AND p.prorettype NOT IN ('trigger'::regtype, 'event_trigger'::regtype)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    IF f.auth_had THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f.sig);
    END IF;
  END LOOP;
END $$;
