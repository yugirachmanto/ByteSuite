-- Letterhead fields for printed purchasing documents (PR/PO/GR/Return/Invoice).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS npwp TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT;
