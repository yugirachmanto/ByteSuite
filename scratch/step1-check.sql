-- ================================================================
-- STEP 1: Run this first to see what's in the database
-- ================================================================

-- Which user profiles exist?
SELECT 
  up.id          AS user_profile_id,
  up.full_name,
  up.role,
  up.org_id,
  o.name         AS org_name,
  au.email       AS auth_email,
  au.created_at  AS registered_at
FROM user_profiles up
LEFT JOIN organizations o  ON o.id = up.org_id
LEFT JOIN auth.users    au ON au.id = up.id
ORDER BY au.created_at;
