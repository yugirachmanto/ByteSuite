-- Run this in Supabase SQL Editor to diagnose what's in the DB
-- It runs as superuser (bypasses RLS) so we see everything

SELECT '=== USER PROFILES ===' AS section, null::uuid AS id, null::text AS name, null::uuid AS org_id
UNION ALL
SELECT '---', id, full_name, org_id FROM user_profiles
UNION ALL
SELECT '=== ORGANIZATIONS ===' , null, null, null
UNION ALL
SELECT '---', id, name, null FROM organizations
UNION ALL
SELECT '=== ITEM_MASTER (first 30) ===' , null, null, null
UNION ALL
SELECT '---', id, name, org_id FROM item_master LIMIT 30
UNION ALL
SELECT '=== RLS STATUS ===' , null, null, null;

-- Check RLS enabled/disabled on all tables
SELECT 
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
