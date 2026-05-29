-- Identify internal team members
ALTER TABLE public.user_profiles ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT false;

-- Organization suspension and billing fields
ALTER TABLE public.organizations 
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'Free',
  ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS next_billing_date DATE;
