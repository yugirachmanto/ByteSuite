-- Kitchen display, simplified and optional:
--  * ONE screen for everything (no Dapur / Bar split): one card per order
--    with all of its items. The per-category station mapping is no longer
--    used (pos_station_mapping is kept but ignored).
--  * Opt-in per organization (organizations.kds_enabled, default off): with it
--    off, no tickets are created at all, so nobody has to "close" anything.
--  * Never piles up: an unfinished ticket drops off the active screen after
--    45 minutes on its own, so a forgotten order can't keep growing a timer.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS kds_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- The org that has been trying the display keeps it on.
UPDATE organizations SET kds_enabled = TRUE WHERE id = '277fa7d2-1068-4855-aaaf-298327662ef3';

-- Ticket per order, only when the module is enabled.
CREATE OR REPLACE FUNCTION create_kds_ticket_for_line() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org UUID;
  v_outlet UUID;
BEGIN
  SELECT o.org_id, o.outlet_id INTO v_org, v_outlet FROM pos_orders o WHERE o.id = NEW.order_id;
  IF v_org IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_org AND kds_enabled) THEN RETURN NEW; END IF;
  INSERT INTO kds_tickets (org_id, outlet_id, order_id, station)
  VALUES (v_org, v_outlet, NEW.order_id, 'kitchen')
  ON CONFLICT (order_id, station) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS get_kds_tickets(UUID, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS complete_kds_ticket(UUID);
DROP FUNCTION IF EXISTS reopen_kds_ticket(UUID);

CREATE OR REPLACE FUNCTION get_kds_orders(p_outlet_id UUID, p_include_done BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org UUID;
  v_role TEXT;
BEGIN
  SELECT org_id, role::text INTO v_org, v_role FROM user_profiles WHERE id = auth.uid();
  IF v_org IS NULL OR v_role NOT IN ('owner','admin','cashier','kitchen') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM outlets WHERE id = p_outlet_id AND org_id = v_org) THEN
    RAISE EXCEPTION 'Outlet not in your organization';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(t.obj ORDER BY t.created_at)
    FROM (
      SELECT g.created_at,
        jsonb_build_object(
          'order_id', g.order_id,
          'order_no', upper(left(g.order_id::text, 8)),
          'status', g.status,
          'created_at', g.created_at,
          'done_at', g.done_at,
          'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('name', im.name, 'qty', ol.qty, 'note', ol.note) ORDER BY im.name)
            FROM pos_order_lines ol JOIN item_master im ON im.id = ol.item_id
            WHERE ol.order_id = g.order_id
          ), '[]'::jsonb)
        ) AS obj
      FROM (
        SELECT k.order_id,
               min(k.created_at) AS created_at,
               CASE WHEN bool_or(k.status = 'new') THEN 'new' ELSE 'done' END AS status,
               max(k.done_at) AS done_at
        FROM kds_tickets k
        JOIN pos_orders o ON o.id = k.order_id
        WHERE k.outlet_id = p_outlet_id AND k.org_id = v_org AND o.status = 'completed'
        GROUP BY k.order_id
      ) g
      WHERE (g.status = 'new' AND g.created_at > now() - interval '45 minutes')
         OR (g.status = 'done' AND p_include_done AND g.done_at > now() - interval '30 minutes')
    ) t
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION complete_kds_order(p_order_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org UUID;
  v_role TEXT;
BEGIN
  SELECT org_id, role::text INTO v_org, v_role FROM user_profiles WHERE id = auth.uid();
  IF v_org IS NULL OR v_role NOT IN ('owner','admin','cashier','kitchen') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE kds_tickets SET status = 'done', done_at = now(), done_by = auth.uid()
  WHERE order_id = p_order_id AND org_id = v_org AND status = 'new';
END;
$$;

CREATE OR REPLACE FUNCTION reopen_kds_order(p_order_id UUID) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org UUID;
  v_role TEXT;
BEGIN
  SELECT org_id, role::text INTO v_org, v_role FROM user_profiles WHERE id = auth.uid();
  IF v_org IS NULL OR v_role NOT IN ('owner','admin','cashier','kitchen') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  UPDATE kds_tickets SET status = 'new', done_at = NULL, done_by = NULL
  WHERE order_id = p_order_id AND org_id = v_org AND status = 'done';
END;
$$;

GRANT EXECUTE ON FUNCTION get_kds_orders(UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION complete_kds_order(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION reopen_kds_order(UUID) TO authenticated;
