-- Add pos_category to item_master to classify products for the POS (e.g., Food, Beverage, Snacks)
ALTER TABLE item_master ADD COLUMN IF NOT EXISTS pos_category TEXT DEFAULT 'Uncategorized';
