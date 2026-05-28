ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS ai_api_key TEXT;
