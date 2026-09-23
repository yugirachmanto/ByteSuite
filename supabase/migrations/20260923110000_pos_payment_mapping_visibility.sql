-- Lets admin/owner control which payment methods actually appear as
-- tender options in the POS terminal, independent of whether they have a
-- GL account mapped (a method can be mapped for accounting but hidden from
-- the cashier, e.g. a legacy method being phased out).
ALTER TABLE pos_payment_method_mapping
  ADD COLUMN is_pos_visible BOOLEAN NOT NULL DEFAULT true;
