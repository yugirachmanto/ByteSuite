-- Enforce debit = credit on gl_entries at the database level.
--
-- Previously only the client-side JS in accounting/journal/new/page.tsx
-- checked totalDebit === totalCredit before insert; nothing stopped an
-- unbalanced insert via a direct API call, and float equality is itself
-- fragile to rounding.
--
-- Implemented as a DEFERRABLE INITIALLY DEFERRED constraint trigger so it
-- only evaluates at COMMIT time, not after each statement. This is required
-- because post_invoice/post_production/manual-journal all insert the debit
-- and credit sides of one journal (grouped by reference_id) as SEPARATE
-- statements within one function call/transaction — a same-statement check
-- would reject those mid-flight. void_invoice deletes an entire reference_id
-- group in one statement, which is also safe under a deferred check (by
-- commit time zero rows remain for that reference_id, which is balanced).
-- reference_id IS NULL rows are not part of any group and are not checked.

CREATE OR REPLACE FUNCTION check_gl_entry_balanced() RETURNS TRIGGER AS $$
DECLARE
  v_reference_id UUID;
  v_diff NUMERIC;
BEGIN
  v_reference_id := COALESCE(NEW.reference_id, OLD.reference_id);

  IF v_reference_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT ROUND(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0)) INTO v_diff
  FROM gl_entries
  WHERE reference_id = v_reference_id;

  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'Unbalanced GL entries for reference_id % (debit - credit = %)', v_reference_id, v_diff;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_gl_entries_balanced_insert ON gl_entries;
CREATE CONSTRAINT TRIGGER trg_gl_entries_balanced_insert
  AFTER INSERT ON gl_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION check_gl_entry_balanced();

DROP TRIGGER IF EXISTS trg_gl_entries_balanced_update ON gl_entries;
CREATE CONSTRAINT TRIGGER trg_gl_entries_balanced_update
  AFTER UPDATE ON gl_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION check_gl_entry_balanced();

DROP TRIGGER IF EXISTS trg_gl_entries_balanced_delete ON gl_entries;
CREATE CONSTRAINT TRIGGER trg_gl_entries_balanced_delete
  AFTER DELETE ON gl_entries
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION check_gl_entry_balanced();
