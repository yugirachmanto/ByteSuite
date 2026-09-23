-- Logo shown at the top of POS receipts (print, PDF preview, emailed HTML
-- body, and the rasterized receipt image sent via email/WhatsApp).
ALTER TABLE organizations ADD COLUMN receipt_logo_url TEXT;
