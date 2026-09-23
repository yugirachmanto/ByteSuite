-- Customers captured automatically when a POS receipt is sent by email or
-- WhatsApp. Cashiers can't write to `customers` directly (AR RLS is
-- owner/admin/finance only), so this SECURITY DEFINER function derives the
-- org from the caller and upserts on their behalf.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS last_receipt_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION record_receipt_contact(p_email TEXT DEFAULT NULL, p_phone TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org UUID;
  v_role TEXT;
  v_email TEXT := NULLIF(lower(btrim(COALESCE(p_email, ''))), '');
  v_digits TEXT := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  v_phone TEXT;
  v_id UUID;
BEGIN
  SELECT org_id, role::text INTO v_org, v_role FROM user_profiles WHERE id = auth.uid();
  IF v_org IS NULL OR v_role NOT IN ('owner','admin','cashier') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  -- Normalise Indonesian numbers to 62xxxxxxxx so 0812.. / +62812.. / 62812.. match.
  IF v_digits <> '' THEN
    v_phone := CASE WHEN v_digits LIKE '0%' THEN '62' || substr(v_digits, 2) ELSE v_digits END;
  END IF;

  IF v_email IS NULL AND v_phone IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_id FROM customers
  WHERE org_id = v_org
    AND ((v_email IS NOT NULL AND lower(email) = v_email)
      OR (v_phone IS NOT NULL AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') IN (v_phone, '0' || substr(v_phone, 3))))
  ORDER BY created_at
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO customers (org_id, name, email, phone, source, last_receipt_at)
    VALUES (v_org, COALESCE(v_email, '+' || v_phone), v_email, v_phone, 'pos_receipt', now())
    RETURNING id INTO v_id;
  ELSE
    UPDATE customers
    SET email = COALESCE(email, v_email),
        phone = COALESCE(phone, v_phone),
        last_receipt_at = now()
    WHERE id = v_id;
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION record_receipt_contact(TEXT, TEXT) TO authenticated;
