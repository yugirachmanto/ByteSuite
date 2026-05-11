-- Add credentials and is_active to user_integrations
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS credentials JSONB;
ALTER TABLE user_integrations ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Add unique constraint to support UPSERT (on conflict)
-- This allows "ON CONFLICT (user_id, provider) DO UPDATE"
ALTER TABLE user_integrations DROP CONSTRAINT IF EXISTS user_integrations_user_id_provider_key;
ALTER TABLE user_integrations ADD CONSTRAINT user_integrations_user_id_provider_key UNIQUE (user_id, provider);

-- Update RLS policies for user_integrations to ensure users can manage their own integrations
DROP POLICY IF EXISTS "Users can manage their own integrations" ON user_integrations;
CREATE POLICY "Users can manage their own integrations" 
ON user_integrations 
FOR ALL 
USING (user_id = auth.uid());
