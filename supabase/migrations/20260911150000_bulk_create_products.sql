-- Bulk upload products (CSV) — mirrors import_beginning_balance's shape:
-- one atomic RPC call from the API route. Always creates new item_master
-- rows (finished goods) — never updates existing ones, matching "bulk
-- upload" = adding new products, not merging. Price is per-outlet
-- (product_prices unique on outlet_id+item_id), so only inserted for the
-- outlet the upload was performed for, when a positive price was given.
CREATE OR REPLACE FUNCTION public.bulk_create_products(p_org_id UUID, p_outlet_id UUID, p_items JSONB)
 RETURNS INTEGER
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  item RECORD;
  v_item_id UUID;
  v_count INTEGER := 0;
BEGIN
  FOR item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    name TEXT, code TEXT, unit TEXT, pos_category TEXT, selling_price NUMERIC
  )
  LOOP
    INSERT INTO item_master (org_id, name, code, unit, category, is_inventory, pos_category)
    VALUES (
      p_org_id,
      item.name,
      NULLIF(item.code, ''),
      COALESCE(NULLIF(item.unit, ''), 'PCS'),
      'finished',
      true,
      NULLIF(item.pos_category, '')
    )
    RETURNING id INTO v_item_id;

    IF item.selling_price IS NOT NULL AND item.selling_price > 0 THEN
      INSERT INTO product_prices (org_id, outlet_id, item_id, selling_price)
      VALUES (p_org_id, p_outlet_id, v_item_id, item.selling_price);
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$function$;
