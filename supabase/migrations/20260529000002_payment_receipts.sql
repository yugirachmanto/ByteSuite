-- Add columns to track payment receipts and GL accounting configuration
ALTER TABLE tenant_invoices ADD COLUMN receipt_url TEXT;
ALTER TABLE tenant_invoices ADD COLUMN payment_outlet_id UUID REFERENCES outlets(id);
ALTER TABLE tenant_invoices ADD COLUMN payment_asset_coa_id UUID REFERENCES chart_of_accounts(id);
ALTER TABLE tenant_invoices ADD COLUMN payment_expense_coa_id UUID REFERENCES chart_of_accounts(id);

-- Create storage bucket for receipts if not exists
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for public reading of receipts
CREATE POLICY "Receipts Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'receipts' );

-- Policies for authenticated users uploading receipts
CREATE POLICY "Receipts Auth Insert" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'receipts' AND auth.role() = 'authenticated' );

-- Update status constraint if necessary
-- The current schema does not have a hard constraint on status, but we will use 'under_review' in application logic.
