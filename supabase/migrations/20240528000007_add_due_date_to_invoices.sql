-- ============================================================
-- MIGRATION: 20240528000007_add_due_date_to_invoices.sql
-- Adds payment due date to invoices for AP Aging
-- ============================================================

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE;
