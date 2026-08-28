-- Add the missing 'admin' value to the user_role enum.
--
-- The invite/edit-user UI has offered "Admin (Manager Access)" as a role
-- option since at least the current codebase (settings/users/page.tsx), and
-- six other files (dashboard layout, outlet-context, app/actions/users.ts,
-- import-beginning route, users/invite and users/resend-invite routes) all
-- already treat role === 'admin' as a legitimate owner-adjacent role for
-- access checks — but the live user_role enum only ever had owner, finance,
-- cashier, kitchen, viewer. Selecting "Admin" when inviting or editing a
-- user has always failed with "invalid input value for enum user_role:
-- admin", the enum was simply never given the value the rest of the app
-- already assumes exists.
--
-- ALTER TYPE ... ADD VALUE cannot run inside the same transaction as a
-- statement that uses the new value, but as its own standalone statement
-- (this migration's only statement) that's not a concern here.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';
