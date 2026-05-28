-- Supabase Migration: POS Sales Import -> GL Posting Integration
-- Targets: pos_coa_mapping, pos_payment_method_mapping, pos_imports, pos_import_lines, views, and RPCs.

-- 1. EXTEND organizations with config
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS posting_window_days integer DEFAULT 30;

-- 2. CREATE pos_coa_mapping TABLE
CREATE TABLE IF NOT EXISTS public.pos_coa_mapping (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  outlet_id        uuid REFERENCES public.outlets(id) ON DELETE CASCADE, -- NULL = org-wide default
  pos_category     text NOT NULL,         -- e.g. "Makanan", "Minuman"
  revenue_coa_id   uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  cogs_coa_id      uuid REFERENCES public.chart_of_accounts(id), -- Nullable for delivery fee, services, etc.
  created_at       timestamptz DEFAULT now()
);

-- Partial Indexes to handle Org Default vs Outlet Overrides
CREATE UNIQUE INDEX IF NOT EXISTS pos_coa_mapping_org_default_idx
  ON public.pos_coa_mapping (org_id, pos_category)
  WHERE outlet_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pos_coa_mapping_outlet_override_idx
  ON public.pos_coa_mapping (org_id, outlet_id, pos_category)
  WHERE outlet_id IS NOT NULL;

-- Enable RLS & Add Org access policies
ALTER TABLE public.pos_coa_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org access pos_coa_mapping" ON public.pos_coa_mapping FOR ALL
  USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));


-- 3. CREATE pos_payment_method_mapping TABLE
CREATE TABLE IF NOT EXISTS public.pos_payment_method_mapping (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  outlet_id         uuid REFERENCES public.outlets(id) ON DELETE CASCADE, -- NULL = org-wide default
  payment_method    text NOT NULL,        -- e.g. "Cash", "GoPay", "OVO"
  coa_id            uuid NOT NULL REFERENCES public.chart_of_accounts(id),
  is_settlement_lag boolean DEFAULT false, -- true = e-wallet, sits in AR
  settlement_days   integer DEFAULT 0,
  created_at        timestamptz DEFAULT now()
);

-- Partial Indexes for payment method overrides
CREATE UNIQUE INDEX IF NOT EXISTS pos_payment_mapping_org_default_idx
  ON public.pos_payment_method_mapping (org_id, payment_method)
  WHERE outlet_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS pos_payment_mapping_outlet_override_idx
  ON public.pos_payment_method_mapping (org_id, outlet_id, payment_method)
  WHERE outlet_id IS NOT NULL;

-- Enable RLS & Add Org access policies
ALTER TABLE public.pos_payment_method_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org access pos_payment_method_mapping" ON public.pos_payment_method_mapping FOR ALL
  USING (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()))
  WITH CHECK (org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid()));


-- 4. CREATE pos_imports TABLE (Header)
CREATE TABLE IF NOT EXISTS public.pos_imports (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  outlet_id       uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  import_date     date NOT NULL,          -- sales date, not today's date
  shift           text,                   -- optional: "Morning", "Evening" or NULL for full day
  source_file     text,
  status          text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'validated', 'posted', 'reversed')),
  total_revenue   numeric(18,2),
  total_cogs      numeric(18,2),
  imported_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_at       timestamptz,
  created_at      timestamptz DEFAULT now()
);

-- Enable RLS & Add Outlet access policies
ALTER TABLE public.pos_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Outlet access pos_imports" ON public.pos_imports FOR ALL
  USING (
    outlet_id IN (
      SELECT id FROM public.outlets WHERE org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM public.outlets WHERE org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid())
    )
  );


-- 5. CREATE pos_import_lines TABLE (Detail)
CREATE TABLE IF NOT EXISTS public.pos_import_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id       uuid NOT NULL REFERENCES public.pos_imports(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  outlet_id       uuid NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  product_name    text NOT NULL,
  pos_category    text NOT NULL,
  quantity        numeric(10,3) NOT NULL,
  unit_price      numeric(18,2) NOT NULL,
  subtotal        numeric(18,2) NOT NULL, -- quantity * unit_price
  cogs_per_unit   numeric(18,2) DEFAULT 0,
  cogs_total      numeric(18,2) DEFAULT 0, -- quantity * cogs_per_unit
  payment_method  text NOT NULL,
  discount_amount numeric(18,2) DEFAULT 0,
  tax_amount      numeric(18,2) DEFAULT 0,  -- PPN
  net_amount      numeric(18,2) NOT NULL,   -- subtotal - discount + tax
  created_at      timestamptz DEFAULT now()
);

-- Enable RLS & Add Outlet access policies
ALTER TABLE public.pos_import_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Outlet access pos_import_lines" ON public.pos_import_lines FOR ALL
  USING (
    outlet_id IN (
      SELECT id FROM public.outlets WHERE org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    outlet_id IN (
      SELECT id FROM public.outlets WHERE org_id = (SELECT org_id FROM public.user_profiles WHERE id = auth.uid())
    )
  );


-- 6. CREATE AGGREGATION VIEWS WITH OVERRIDES
-- View for Journal Summaries (separates DPP and PPN splits, prioritizes overrides)
CREATE OR REPLACE VIEW public.pos_journal_summaries AS
WITH resolved_mappings AS (
  SELECT DISTINCT ON (pil.import_id, pil.pos_category)
    pil.import_id,
    pil.pos_category,
    pcm.revenue_coa_id,
    pcm.cogs_coa_id
  FROM public.pos_import_lines pil
  JOIN public.pos_coa_mapping pcm
    ON pcm.org_id = pil.org_id
    AND pcm.pos_category = pil.pos_category
    AND (pcm.outlet_id = pil.outlet_id OR pcm.outlet_id IS NULL)
  ORDER BY pil.import_id, pil.pos_category, pcm.outlet_id NULLS LAST
)
SELECT
  pil.import_id,
  pil.org_id,
  pil.outlet_id,
  pil.pos_category,
  rm.revenue_coa_id,
  rm.cogs_coa_id,
  SUM(pil.net_amount - pil.tax_amount)  AS total_revenue_dpp,
  SUM(pil.tax_amount)                   AS total_ppn_keluaran,
  SUM(pil.cogs_total)                   AS total_cogs
FROM public.pos_import_lines pil
LEFT JOIN resolved_mappings rm
  ON rm.import_id = pil.import_id AND rm.pos_category = pil.pos_category
GROUP BY
  pil.import_id, pil.org_id, pil.outlet_id, pil.pos_category,
  rm.revenue_coa_id, rm.cogs_coa_id;


-- View for Payment Summaries (prioritizes overrides)
CREATE OR REPLACE VIEW public.pos_payment_summaries AS
WITH resolved_payment_mappings AS (
  SELECT DISTINCT ON (pil.import_id, pil.payment_method)
    pil.import_id,
    pil.payment_method,
    ppm.coa_id            AS payment_coa_id,
    ppm.is_settlement_lag
  FROM public.pos_import_lines pil
  JOIN public.pos_payment_method_mapping ppm
    ON ppm.org_id = pil.org_id
    AND ppm.payment_method = pil.payment_method
    AND (ppm.outlet_id = pil.outlet_id OR ppm.outlet_id IS NULL)
  ORDER BY pil.import_id, pil.payment_method, ppm.outlet_id NULLS LAST
)
SELECT
  pil.import_id,
  pil.org_id,
  pil.outlet_id,
  pil.payment_method,
  rpm.payment_coa_id,
  rpm.is_settlement_lag,
  SUM(pil.net_amount)   AS total_amount
FROM public.pos_import_lines pil
LEFT JOIN resolved_payment_mappings rpm
  ON rpm.import_id = pil.import_id AND rpm.payment_method = pil.payment_method
GROUP BY
  pil.import_id, pil.org_id, pil.outlet_id, pil.payment_method,
  rpm.payment_coa_id, rpm.is_settlement_lag;


-- 7. RPC FUNCTIONS FOR VALIDATION, PREVIEW, AND POSTING

-- RPC: validate_pos_import()
CREATE OR REPLACE FUNCTION public.validate_pos_import(p_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_id          uuid;
  v_outlet_id       uuid;
  v_unmapped_cats   text[];
  v_unmapped_pmts   text[];
  v_has_tax         boolean := false;
  v_ppn_mapped      boolean := false;
  v_unmapped_ppn    text[] := '{}';
BEGIN
  SELECT org_id, outlet_id INTO v_org_id, v_outlet_id FROM public.pos_imports WHERE id = p_import_id;

  -- 1. Check for unmapped product categories (taking overrides into account)
  SELECT ARRAY_AGG(DISTINCT pos_category) INTO v_unmapped_cats
  FROM public.pos_import_lines pil
  WHERE pil.import_id = p_import_id
    AND NOT EXISTS (
      SELECT 1 FROM public.pos_coa_mapping pcm
      WHERE pcm.org_id = v_org_id
        AND pcm.pos_category = pil.pos_category
        AND (pcm.outlet_id = v_outlet_id OR pcm.outlet_id IS NULL)
    );

  -- 2. Check for unmapped payment methods
  SELECT ARRAY_AGG(DISTINCT payment_method) INTO v_unmapped_pmts
  FROM public.pos_import_lines pil
  WHERE pil.import_id = p_import_id
    AND NOT EXISTS (
      SELECT 1 FROM public.pos_payment_method_mapping ppm
      WHERE ppm.org_id = v_org_id
        AND ppm.payment_method = pil.payment_method
        AND (ppm.outlet_id = v_outlet_id OR ppm.outlet_id IS NULL)
    );

  -- 3. Check for unmapped ppn_keluaran account if any transaction has tax
  SELECT EXISTS (
    SELECT 1 FROM public.pos_import_lines WHERE import_id = p_import_id AND tax_amount > 0
  ) INTO v_has_tax;

  IF v_has_tax THEN
    SELECT EXISTS (
      SELECT 1 FROM public.default_coa_mappings WHERE org_id = v_org_id AND account_role = 'ppn_keluaran'
    ) INTO v_ppn_mapped;
    
    IF NOT v_ppn_mapped THEN
      v_unmapped_ppn := ARRAY['ppn_keluaran'];
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'is_valid',           (v_unmapped_cats IS NULL AND v_unmapped_pmts IS NULL AND (v_unmapped_ppn = '{}'::text[])),
    'unmapped_categories', COALESCE(v_unmapped_cats, '{}'),
    'unmapped_payments',   COALESCE(v_unmapped_pmts, '{}'),
    'unmapped_ppn_keluaran', v_unmapped_ppn
  );
END;
$$;


-- RPC: preview_pos_journal()
CREATE OR REPLACE FUNCTION public.preview_pos_journal(p_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_lines              jsonb := '[]'::jsonb;
  v_org_id             uuid;
  v_summary            RECORD;
  v_payment            RECORD;
  v_inventory_coa_id   uuid;
  v_ppn_keluaran_coa_id uuid;
  v_coa_code           text;
  v_coa_name           text;
BEGIN
  SELECT org_id INTO v_org_id FROM public.pos_imports WHERE id = p_import_id;
  
  -- Resolve Inventory and PPN accounts
  SELECT coa_id INTO v_inventory_coa_id FROM public.default_coa_mappings WHERE org_id = v_org_id AND account_role = 'inventory_asset';
  SELECT coa_id INTO v_ppn_keluaran_coa_id FROM public.default_coa_mappings WHERE org_id = v_org_id AND account_role = 'ppn_keluaran';
  
  -- Debit: Payments
  FOR v_payment IN
    SELECT * FROM public.pos_payment_summaries WHERE import_id = p_import_id
  LOOP
    SELECT code, name INTO v_coa_code, v_coa_name FROM public.chart_of_accounts WHERE id = v_payment.payment_coa_id;
    v_lines := v_lines || jsonb_build_object(
      'side',         'debit',
      'coa_id',       v_payment.payment_coa_id,
      'coa_code',     v_coa_code,
      'coa_name',     v_coa_name,
      'debit',        v_payment.total_amount,
      'credit',       0,
      'description',  'POS Receipt: ' || v_payment.payment_method
    );
  END LOOP;
  
  -- Credit: Revenue DPP & PPN Keluaran + COGS / Inventory
  FOR v_summary IN
    SELECT * FROM public.pos_journal_summaries WHERE import_id = p_import_id
  LOOP
    -- Credit: Revenue DPP
    SELECT code, name INTO v_coa_code, v_coa_name FROM public.chart_of_accounts WHERE id = v_summary.revenue_coa_id;
    v_lines := v_lines || jsonb_build_object(
      'side',         'credit',
      'coa_id',       v_summary.revenue_coa_id,
      'coa_code',     v_coa_code,
      'coa_name',     v_coa_name,
      'debit',        0,
      'credit',       v_summary.total_revenue_dpp,
      'description',  'POS Revenue: ' || v_summary.pos_category
    );
    
    -- Credit: PPN Keluaran
    IF v_summary.total_ppn_keluaran IS NOT NULL AND v_summary.total_ppn_keluaran > 0 AND v_ppn_keluaran_coa_id IS NOT NULL THEN
      SELECT code, name INTO v_coa_code, v_coa_name FROM public.chart_of_accounts WHERE id = v_ppn_keluaran_coa_id;
      v_lines := v_lines || jsonb_build_object(
        'side',         'credit',
        'coa_id',       v_ppn_keluaran_coa_id,
        'coa_code',     v_coa_code,
        'coa_name',     v_coa_name,
        'debit',        0,
        'credit',       v_summary.total_ppn_keluaran,
        'description',  'POS PPN Keluaran: ' || v_summary.pos_category
      );
    END IF;
    
    -- COGS & Inventory (if available)
    IF v_summary.total_cogs IS NOT NULL AND v_summary.total_cogs > 0 AND v_summary.cogs_coa_id IS NOT NULL AND v_inventory_coa_id IS NOT NULL THEN
      -- Debit: COGS
      SELECT code, name INTO v_coa_code, v_coa_name FROM public.chart_of_accounts WHERE id = v_summary.cogs_coa_id;
      v_lines := v_lines || jsonb_build_object(
        'side',         'debit',
        'coa_id',       v_summary.cogs_coa_id,
        'coa_code',     v_coa_code,
        'coa_name',     v_coa_name,
        'debit',        v_summary.total_cogs,
        'credit',       0,
        'description',  'POS COGS: ' || v_summary.pos_category
      );
      
      -- Credit: Inventory
      SELECT code, name INTO v_coa_code, v_coa_name FROM public.chart_of_accounts WHERE id = v_inventory_coa_id;
      v_lines := v_lines || jsonb_build_object(
        'side',         'credit',
        'coa_id',       v_inventory_coa_id,
        'coa_code',     v_coa_code,
        'coa_name',     v_coa_name,
        'debit',        0,
        'credit',       v_summary.total_cogs,
        'description',  'POS Inventory Out: ' || v_summary.pos_category
      );
    END IF;
  END LOOP;
  
  RETURN v_lines;
END;
$$;


-- RPC: post_pos_import() (with Option A posting window check & PPN split)
CREATE OR REPLACE FUNCTION public.post_pos_import(p_import_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_import              public.pos_imports%ROWTYPE;
  v_summary             RECORD;
  v_payment             RECORD;
  v_inventory_coa_id    uuid;
  v_ppn_keluaran_coa_id uuid;
  v_posting_window_days integer := 30;
  v_total_debit         numeric := 0;
  v_total_credit        numeric := 0;
  v_validation          jsonb;
BEGIN
  -- 1. Load import batch
  SELECT * INTO v_import FROM public.pos_imports WHERE id = p_import_id;

  IF v_import.id IS NULL THEN
    RAISE EXCEPTION 'POS import batch with ID % not found', p_import_id;
  END IF;

  IF v_import.status = 'posted' THEN
    RAISE EXCEPTION 'POS import batch % is already posted', p_import_id;
  END IF;

  -- 2. Period lock check (Option A Posting Window)
  SELECT COALESCE(posting_window_days, 30) INTO v_posting_window_days
  FROM public.organizations
  WHERE id = v_import.org_id;

  IF v_import.import_date < CURRENT_DATE - (v_posting_window_days || ' days')::INTERVAL THEN
    RAISE EXCEPTION 'Import date % is outside the allowed posting window of % days',
      v_import.import_date, v_posting_window_days;
  END IF;

  -- 3. Validate mapping configuration
  v_validation := public.validate_pos_import(p_import_id);
  IF NOT (v_validation->>'is_valid')::boolean THEN
    RAISE EXCEPTION 'Validation failed. Unmapped categories: %. Unmapped payments: %. Unmapped tax: %',
      v_validation->'unmapped_categories',
      v_validation->'unmapped_payments',
      v_validation->'unmapped_ppn_keluaran';
  END IF;

  -- 4. Resolve core accounts from default mapping
  SELECT coa_id INTO v_inventory_coa_id 
  FROM public.default_coa_mappings 
  WHERE org_id = v_import.org_id AND account_role = 'inventory_asset';

  SELECT coa_id INTO v_ppn_keluaran_coa_id 
  FROM public.default_coa_mappings 
  WHERE org_id = v_import.org_id AND account_role = 'ppn_keluaran';

  -- 5. DEBIT: Payment method accounts
  FOR v_payment IN
    SELECT * FROM public.pos_payment_summaries WHERE import_id = p_import_id
  LOOP
    INSERT INTO public.gl_entries (org_id, outlet_id, entry_date, coa_id, debit, credit, description, reference_type, reference_id)
    VALUES (v_import.org_id, v_import.outlet_id, v_import.import_date, v_payment.payment_coa_id, v_payment.total_amount, 0,
            'POS Sales - ' || v_payment.payment_method || ' | ' || v_import.import_date,
            'pos_import', p_import_id);

    v_total_debit := v_total_debit + v_payment.total_amount;
  END LOOP;

  -- 6. CREDIT: Revenue DPP & PPN Keluaran
  FOR v_summary IN
    SELECT * FROM public.pos_journal_summaries WHERE import_id = p_import_id
  LOOP
    -- Credit: Revenue DPP
    INSERT INTO public.gl_entries (org_id, outlet_id, entry_date, coa_id, debit, credit, description, reference_type, reference_id)
    VALUES (v_import.org_id, v_import.outlet_id, v_import.import_date, v_summary.revenue_coa_id, 0, v_summary.total_revenue_dpp,
            'POS Revenue - ' || v_summary.pos_category || ' | ' || v_import.import_date,
            'pos_import', p_import_id);

    v_total_credit := v_total_credit + v_summary.total_revenue_dpp;

    -- Credit: PPN Keluaran (if tax_amount > 0)
    IF v_summary.total_ppn_keluaran IS NOT NULL AND v_summary.total_ppn_keluaran > 0 THEN
      IF v_ppn_keluaran_coa_id IS NULL THEN
        RAISE EXCEPTION 'PPN Keluaran default COA mapping is required but not configured for org %', v_import.org_id;
      END IF;

      INSERT INTO public.gl_entries (org_id, outlet_id, entry_date, coa_id, debit, credit, description, reference_type, reference_id)
      VALUES (v_import.org_id, v_import.outlet_id, v_import.import_date, v_ppn_keluaran_coa_id, 0, v_summary.total_ppn_keluaran,
              'PPN Keluaran - ' || v_summary.pos_category || ' | ' || v_import.import_date,
              'pos_import', p_import_id);

      v_total_credit := v_total_credit + v_summary.total_ppn_keluaran;
    END IF;

    -- 7. DEBIT: COGS & CREDIT: Inventory (Self-balancing entries, do not add to overall debit/credit totals)
    IF v_summary.total_cogs IS NOT NULL AND v_summary.total_cogs > 0 AND v_summary.cogs_coa_id IS NOT NULL AND v_inventory_coa_id IS NOT NULL THEN
      -- Debit COGS
      INSERT INTO public.gl_entries (org_id, outlet_id, entry_date, coa_id, debit, credit, description, reference_type, reference_id)
      VALUES (v_import.org_id, v_import.outlet_id, v_import.import_date, v_summary.cogs_coa_id, v_summary.total_cogs, 0,
              'COGS - ' || v_summary.pos_category || ' | ' || v_import.import_date,
              'pos_import', p_import_id);

      -- Credit Inventory
      INSERT INTO public.gl_entries (org_id, outlet_id, entry_date, coa_id, debit, credit, description, reference_type, reference_id)
      VALUES (v_import.org_id, v_import.outlet_id, v_import.import_date, v_inventory_coa_id, 0, v_summary.total_cogs,
              'Inventory Out - ' || v_summary.pos_category || ' | ' || v_import.import_date,
              'pos_import', p_import_id);
    END IF;
  END LOOP;

  -- 8. Balance Assertion
  IF round(v_total_debit, 2) <> round(v_total_credit, 2) THEN
    RAISE EXCEPTION 'POS journal does not balance: debit=% credit=%', v_total_debit, v_total_credit;
  END IF;

  -- 9. Mark import as posted
  UPDATE public.pos_imports
  SET status = 'posted', posted_at = now(), posted_by = auth.uid()
  WHERE id = p_import_id;

  -- 10. Cache total revenue and total cogs figures inside public.pos_imports
  UPDATE public.pos_imports
  SET total_revenue = (SELECT COALESCE(SUM(net_amount), 0) FROM public.pos_import_lines WHERE import_id = p_import_id),
      total_cogs = (SELECT COALESCE(SUM(cogs_total), 0) FROM public.pos_import_lines WHERE import_id = p_import_id)
  WHERE id = p_import_id;

END;
$$;
