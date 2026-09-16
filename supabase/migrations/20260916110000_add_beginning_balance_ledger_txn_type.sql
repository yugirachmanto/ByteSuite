-- import_beginning_balance() (20260828000002) has always inserted
-- txn_type = 'BEGINNING_BALANCE' into stock_ledger, but that value was
-- never actually added to the live ledger_txn_type enum — every beginning
-- inventory import has failed with "invalid input value for enum
-- ledger_txn_type" since the feature shipped.
ALTER TYPE ledger_txn_type ADD VALUE IF NOT EXISTS 'BEGINNING_BALANCE';
