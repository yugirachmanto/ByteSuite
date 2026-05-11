-- Ensure the invoices bucket exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow public access to view invoices (needed for the AI to fetch them via URL)
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'invoices');

-- Allow authenticated users to upload invoices
CREATE POLICY "Authenticated Upload" ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'invoices' AND auth.role() = 'authenticated');

-- Allow authenticated users to update/delete their own invoices
CREATE POLICY "Authenticated Manage" ON storage.objects FOR ALL
USING (bucket_id = 'invoices' AND auth.role() = 'authenticated');
