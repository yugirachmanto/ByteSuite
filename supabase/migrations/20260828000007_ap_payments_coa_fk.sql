-- Add the missing foreign key from ap_payments.coa_id to chart_of_accounts.
--
-- Reported: clicking "Payment History" on an AP invoice with a recorded
-- payment showed "Failed to load payment history". Root cause: the AP page
-- (accounting/ap/page.tsx) queries `ap_payments.select('*, chart_of_accounts
-- (name, code)')` — an embedded/joined select, which PostgREST can only
-- resolve when it can discover an actual foreign key constraint between the
-- two tables. record_ap_payment (20240510000001_ap_module.sql) has always
-- written a valid chart_of_accounts id into ap_payments.coa_id, but the
-- column was never declared as a foreign key, so PostgREST has never been
-- able to satisfy that query — reproduced directly: PGRST200 "Could not find
-- a relationship between 'ap_payments' and 'chart_of_accounts'".
--
-- Confirmed safe to add before applying: 0 of the table's existing rows have
-- a coa_id that doesn't match a real chart_of_accounts row.

ALTER TABLE ap_payments
  ADD CONSTRAINT ap_payments_coa_id_fkey
  FOREIGN KEY (coa_id) REFERENCES chart_of_accounts(id);
