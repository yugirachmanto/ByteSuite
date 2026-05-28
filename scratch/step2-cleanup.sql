-- ================================================================
-- STEP 2: Nuclear cleanup — deletes EVERYTHING except YOUR account
-- 
-- HOW TO USE:
-- 1. Run step1-check.sql first
-- 2. Find YOUR email in the results → copy its "user_profile_id"
-- 3. Replace the UUID below with your user_profile_id
-- 4. Run this script
-- ================================================================

-- ⚠️  REPLACE THIS with your actual user_profile_id from step1-check.sql
DO $$
DECLARE
  my_user_id   UUID;
  my_org_id    UUID;
BEGIN
  -- Find YOUR user id from auth (latest registered account that isn't a test email)
  -- This picks the MOST RECENTLY registered real user
  SELECT au.id INTO my_user_id
  FROM auth.users au
  JOIN user_profiles up ON up.id = au.id
  WHERE au.email NOT LIKE '%debug.test%'
    AND au.email NOT LIKE '%@test.%'
  ORDER BY au.created_at DESC
  LIMIT 1;

  IF my_user_id IS NULL THEN
    RAISE EXCEPTION 'Could not find a real user. Check auth.users manually.';
  END IF;

  SELECT org_id INTO my_org_id FROM user_profiles WHERE id = my_user_id;

  RAISE NOTICE '✅ Keeping user: % (org: %)', my_user_id, my_org_id;
  RAISE NOTICE 'All other user data will be deleted.';

  -- Delete item_master for other orgs
  DELETE FROM item_master    WHERE org_id <> my_org_id;
  DELETE FROM chart_of_accounts WHERE org_id <> my_org_id;
  DELETE FROM bom            WHERE org_id <> my_org_id;

  -- Delete outlet-linked data for other orgs
  DELETE FROM stock_batches     WHERE outlet_id IN (SELECT id FROM outlets WHERE org_id <> my_org_id);
  DELETE FROM stock_ledger      WHERE outlet_id IN (SELECT id FROM outlets WHERE org_id <> my_org_id);
  DELETE FROM inventory_balance WHERE outlet_id IN (SELECT id FROM outlets WHERE org_id <> my_org_id);
  DELETE FROM production_log    WHERE outlet_id IN (SELECT id FROM outlets WHERE org_id <> my_org_id);
  DELETE FROM opname_log        WHERE outlet_id IN (SELECT id FROM outlets WHERE org_id <> my_org_id);
  DELETE FROM gl_entries        WHERE outlet_id IN (SELECT id FROM outlets WHERE org_id <> my_org_id);

  -- Delete invoices for other orgs
  DELETE FROM invoice_lines WHERE invoice_id IN (
    SELECT id FROM invoices WHERE outlet_id IN (SELECT id FROM outlets WHERE org_id <> my_org_id)
  );
  DELETE FROM invoices WHERE outlet_id IN (SELECT id FROM outlets WHERE org_id <> my_org_id);

  -- Delete other user profiles (not yours)
  DELETE FROM user_profiles WHERE id <> my_user_id;

  -- Delete other outlets and orgs
  DELETE FROM outlets       WHERE org_id <> my_org_id;
  DELETE FROM organizations WHERE id    <> my_org_id;

  -- Delete orphan auth users (test accounts, debug accounts)
  DELETE FROM auth.users WHERE id <> my_user_id;

  RAISE NOTICE '✅ Cleanup complete. Database now contains only your account.';
END $$;

-- Verify the result
SELECT 'user_profiles' AS tbl, count(*) FROM user_profiles
UNION ALL SELECT 'organizations', count(*) FROM organizations
UNION ALL SELECT 'outlets', count(*) FROM outlets
UNION ALL SELECT 'item_master', count(*) FROM item_master
UNION ALL SELECT 'auth.users', count(*) FROM auth.users;
