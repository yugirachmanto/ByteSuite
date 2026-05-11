-- Backfill payment_status and paid_amount for existing posted invoices
UPDATE invoices 
SET 
  payment_status = 'unpaid',
  paid_amount = 0
WHERE status = 'posted' AND payment_status IS NULL;
