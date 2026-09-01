-- Per-user language preference. Defaults to 'id' (the business's home
-- locale) so existing users see no change until they opt into English via
-- the new toggle on /profile.

ALTER TABLE user_profiles
  ADD COLUMN locale TEXT NOT NULL DEFAULT 'id' CHECK (locale IN ('id', 'en'));
