-- POS Fase 8: org-level default thermal paper width for receipts.
-- The receipt page still lets the cashier override per print.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS receipt_paper_width TEXT NOT NULL DEFAULT '58mm'
  CHECK (receipt_paper_width IN ('58mm', '80mm'));
