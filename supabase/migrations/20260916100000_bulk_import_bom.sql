-- Bulk BOM/Recipe import for WIP and Product (finished) outputs.
--
-- Ingredient (input) items are resolved to ids server-side in the API
-- route before this RPC is called (never trust a client-supplied id into
-- a SECURITY DEFINER function). Output items ARE allowed to be
-- auto-created here when missing — confirmed with the user — since the
-- whole point of this importer is defining a new WIP/Product's recipe in
-- one step.
--
-- Replace semantics per output (matches the manual /settings/bom page's
-- own save flow: DELETE then INSERT, not append) — re-uploading a
-- recipe corrects it rather than duplicating lines, which matters since
-- `bom` has no uniqueness constraint on (output_item_id, input_item_id).
--
-- A circular-reference guard runs once after all recipes in the batch are
-- written: a depth-capped recursive CTE walking the org's whole bom graph.
-- Any cycle rolls back the entire batch (nothing partially committed) —
-- this is the DB-layer equivalent of the client-side `wouldCreateCycle`
-- check in settings/bom/page.tsx, but enforced regardless of UI.

CREATE OR REPLACE FUNCTION public.bulk_import_bom(p_org_id UUID, p_recipes JSONB)
 RETURNS INTEGER
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  recipe JSONB;
  line JSONB;
  v_output_name TEXT;
  v_output_category TEXT;
  v_output_unit TEXT;
  v_batch_yield_qty NUMERIC;
  v_output_id UUID;
  v_item_category item_category;
  v_dup_input_id UUID;
  v_cycle_start_id UUID;
  v_cycle_item_name TEXT;
  v_recipe_count INTEGER := 0;
BEGIN
  FOR recipe IN SELECT * FROM jsonb_array_elements(p_recipes)
  LOOP
    v_output_name := recipe->>'output_name';
    v_output_category := recipe->>'output_category';
    v_output_unit := recipe->>'output_unit';
    v_batch_yield_qty := (recipe->>'batch_yield_qty')::NUMERIC;

    IF v_output_name IS NULL OR v_output_name = '' THEN
      RAISE EXCEPTION 'Recipe row missing an output item name';
    END IF;
    IF v_batch_yield_qty IS NULL OR v_batch_yield_qty <= 0 THEN
      RAISE EXCEPTION 'Recipe for % needs a batch yield quantity greater than 0', v_output_name;
    END IF;

    v_item_category := CASE WHEN v_output_category = 'wip' THEN 'wip'::item_category ELSE 'finished'::item_category END;

    SELECT id INTO v_output_id FROM item_master WHERE org_id = p_org_id AND name = v_output_name LIMIT 1;

    IF v_output_id IS NULL THEN
      INSERT INTO item_master (org_id, name, unit, category, is_inventory)
      VALUES (p_org_id, v_output_name, COALESCE(NULLIF(v_output_unit, ''), 'PCS'), v_item_category, true)
      RETURNING id INTO v_output_id;
    END IF;

    DELETE FROM bom WHERE output_item_id = v_output_id;

    FOR line IN SELECT * FROM jsonb_array_elements(recipe->'lines')
    LOOP
      INSERT INTO bom (org_id, output_item_id, input_item_id, qty_per_unit, unit)
      VALUES (
        p_org_id,
        v_output_id,
        (line->>'input_item_id')::UUID,
        (line->>'qty')::NUMERIC / v_batch_yield_qty,
        line->>'unit'
      );
    END LOOP;

    SELECT input_item_id INTO v_dup_input_id FROM bom
    WHERE output_item_id = v_output_id
    GROUP BY input_item_id HAVING COUNT(*) > 1 LIMIT 1;

    IF v_dup_input_id IS NOT NULL THEN
      RAISE EXCEPTION 'Recipe for % lists the same ingredient more than once', v_output_name;
    END IF;

    v_recipe_count := v_recipe_count + 1;
  END LOOP;

  -- Org-wide circular-reference check, depth-capped (50 levels is far
  -- beyond any realistic recipe nesting) so the traversal always
  -- terminates even while walking a cyclic subgraph.
  WITH RECURSIVE paths AS (
    SELECT b.output_item_id AS start_id, b.input_item_id AS current_id, 1 AS depth
    FROM bom b WHERE b.org_id = p_org_id
    UNION ALL
    SELECT p.start_id, b2.input_item_id, p.depth + 1
    FROM paths p
    JOIN bom b2 ON b2.output_item_id = p.current_id AND b2.org_id = p_org_id
    WHERE p.depth < 50 AND p.current_id <> p.start_id
  )
  SELECT start_id INTO v_cycle_start_id FROM paths WHERE current_id = start_id LIMIT 1;

  IF v_cycle_start_id IS NOT NULL THEN
    SELECT name INTO v_cycle_item_name FROM item_master WHERE id = v_cycle_start_id;
    RAISE EXCEPTION 'Circular BOM reference detected involving item: %', COALESCE(v_cycle_item_name, v_cycle_start_id::text);
  END IF;

  RETURN v_recipe_count;
END;
$function$;
