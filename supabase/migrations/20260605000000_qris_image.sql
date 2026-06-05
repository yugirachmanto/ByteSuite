-- Add QRIS image URL and Bank Transfer details to organizations for Customer Facing Display
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS qris_image_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS bank_name TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS bank_account_holder TEXT;
