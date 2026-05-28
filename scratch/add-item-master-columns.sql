-- Run this in Supabase SQL Editor to add the missing columns to item_master.
-- Safe to run multiple times (IF NOT EXISTS guards).

ALTER TABLE item_master
  ADD COLUMN IF NOT EXISTS purchase_unit      TEXT,
  ADD COLUMN IF NOT EXISTS conversion_factor  NUMERIC DEFAULT 1;

-- Backfill: for existing rows set purchase_unit = unit and factor = 1
UPDATE item_master
SET
  purchase_unit     = unit,
  conversion_factor = 1
WHERE purchase_unit IS NULL;

SELECT 'Done. item_master now has purchase_unit and conversion_factor columns.' AS result;
