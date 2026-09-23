-- Cash/Card/QRIS were only ever a hardcoded client-side fallback shown when
-- an org had zero pos_payment_method_mapping rows (see pos/page.tsx) — they
-- never existed as real rows, so admin/owner had nowhere to toggle their POS
-- visibility or (optionally) map them to a GL account. This makes them real
-- rows, and lets coa_id stay unset (POS/GL already treats a mapping row with
-- a NULL coa_id the same as no mapping at all — falls back to a generic Kas
-- account lookup, or flags the sale gl_status='pending_mapping' — matching
-- this codebase's existing gap-tolerant policy for POS, unlike back-office
-- flows that hard-fail on a missing mapping).
ALTER TABLE pos_payment_method_mapping
  ALTER COLUMN coa_id DROP NOT NULL;

-- Backfill: give every existing org the three default methods (org-wide
-- default scope, outlet_id NULL), skipping any org that already has a
-- mapping row under that name (e.g. already customized "Cash").
INSERT INTO pos_payment_method_mapping (org_id, outlet_id, payment_method, coa_id, is_settlement_lag, settlement_days, is_pos_visible)
SELECT o.id, NULL, m.payment_method, NULL, false, 0, true
FROM organizations o
CROSS JOIN (VALUES ('Cash'), ('Card'), ('QRIS')) AS m(payment_method)
ON CONFLICT (org_id, payment_method) WHERE outlet_id IS NULL DO NOTHING;

-- Seed the same three defaults for every new org going forward, so this
-- stays true without relying on the (very large) register_new_org function
-- also being kept in sync.
CREATE OR REPLACE FUNCTION seed_default_pos_payment_methods()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO pos_payment_method_mapping (org_id, outlet_id, payment_method, coa_id, is_settlement_lag, settlement_days, is_pos_visible)
  VALUES
    (NEW.id, NULL, 'Cash', NULL, false, 0, true),
    (NEW.id, NULL, 'Card', NULL, false, 0, true),
    (NEW.id, NULL, 'QRIS', NULL, false, 0, true)
  ON CONFLICT (org_id, payment_method) WHERE outlet_id IS NULL DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_seed_default_pos_payment_methods ON organizations;
CREATE TRIGGER trg_seed_default_pos_payment_methods
  AFTER INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION seed_default_pos_payment_methods();
