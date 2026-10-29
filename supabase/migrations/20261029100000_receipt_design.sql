-- Per-organization receipt design: free-text header/footer, optional footer
-- image, and toggles for the header lines that used to be hardcoded.
-- NULL header/footer text = fall back to the previous built-in layout.
ALTER TABLE organizations
  ADD COLUMN receipt_header_text TEXT,
  ADD COLUMN receipt_footer_text TEXT,
  ADD COLUMN receipt_footer_image_url TEXT,
  ADD COLUMN receipt_show_org_name BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN receipt_show_address BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN receipt_show_npwp BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN receipt_show_outlet_name BOOLEAN NOT NULL DEFAULT TRUE;
