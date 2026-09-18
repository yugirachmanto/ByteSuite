-- item_master.category is a fixed tier enum (raw/wip/packaging/recipe/finished)
-- and can't represent an org's own free-form grouping (e.g. "Dry Store",
-- "Perishable", "Frozen", "Dairy & Egg" — storage/purchasing groups from a
-- migrated COA-style item list). sub_category is a plain, unconstrained text
-- field for exactly that: whatever grouping the org already uses, with no
-- predefined list to fight against.
ALTER TABLE item_master ADD COLUMN sub_category TEXT;
