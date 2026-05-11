-- Fix: Add missing columns to invoices table required by post_invoice RPC
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount NUMERIC DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid' 
  CHECK (payment_status IN ('unpaid', 'partial', 'paid'));
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_amount NUMERIC DEFAULT 0;
