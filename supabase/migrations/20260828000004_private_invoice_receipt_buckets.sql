-- Make the invoices and receipts buckets private.
--
-- Both were created world-readable (`storage.buckets.public = true`, plus a
-- "Public Access"/"Receipts Public Access" SELECT policy with no auth check
-- at all): anyone with a URL — leaked via logs, referrer headers, browser
-- history, or simple guessing of the `${invoiceId}-${timestamp}.${ext}`
-- naming pattern — could view another tenant's purchase invoice or payment
-- receipt with zero authentication.
--
-- The app now resolves short-lived signed URLs on demand
-- (src/lib/storage.ts's getSignedFileUrl) everywhere these are displayed or
-- fetched, so flipping the buckets to private + authenticated-only SELECT
-- doesn't break existing functionality. Insert/update policies are
-- unchanged (already authenticated-gated).

UPDATE storage.buckets SET public = false WHERE id = 'invoices';
UPDATE storage.buckets SET public = false WHERE id = 'receipts';

DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Authenticated Access" ON storage.objects FOR SELECT
  USING (bucket_id = 'invoices' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Receipts Public Access" ON storage.objects;
CREATE POLICY "Receipts Authenticated Access" ON storage.objects FOR SELECT
  USING (bucket_id = 'receipts' AND auth.role() = 'authenticated');
