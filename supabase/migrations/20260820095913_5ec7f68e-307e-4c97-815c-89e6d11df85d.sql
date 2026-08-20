CREATE OR REPLACE FUNCTION public.reorder_versioned_rows(p_table text, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_id uuid;
  v_cur integer;
  v_pid uuid;
  v_stale jsonb := '[]'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_idx integer := 0;
  v_parent_col text := public.numbered_parent_column(p_table);
  v_flag text := 'app.reseq_' || p_table;
  v_prev_flag text;
  v_parents uuid[] := '{}';
  v_parent uuid;
BEGIN
  IF NOT public.versioned_table_allowed(p_table) THEN
    RAISE EXCEPTION 'Table % is not version-guarded', p_table;
  END IF;

  -- Authorise + verify every row first; nothing is written until all pass.
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_id := (v_item ->> 'id')::uuid;
    v_pid := public.versioned_row_proposal(p_table, v_id);
    IF v_pid IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'conflict', true, 'error', 'not_found', 'stale', jsonb_build_array(v_id));
    END IF;
    IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), v_pid) THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
    EXECUTE format('SELECT version FROM %I WHERE id = $1', p_table) INTO v_cur USING v_id;
    IF (v_item ? 'expected_version') AND (v_item ->> 'expected_version') IS NOT NULL
       AND (v_item ->> 'expected_version')::int <> v_cur THEN
      v_stale := v_stale || jsonb_build_array(v_id);
    END IF;
  END LOOP;

  IF jsonb_array_length(v_stale) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'stale', v_stale);
  END IF;

  -- Remember the parents so the canonical resequence can run once at the end.
  IF v_parent_col IS NOT NULL THEN
    EXECUTE format(
      'SELECT array_agg(DISTINCT %I) FROM %I WHERE id = ANY($1)', v_parent_col, p_table)
      INTO v_parents
      USING ARRAY(SELECT (value ->> 'id')::uuid FROM jsonb_array_elements(p_items));
  END IF;

  -- Hold off the per-statement resequencing triggers for the duration of the
  -- write. They re-derive number AND order_index for the whole list from
  -- whatever is stored at that instant, so letting them fire between the
  -- per-row updates below would clobber the intent of the rows already moved.
  v_prev_flag := COALESCE(current_setting(v_flag, true), '');
  PERFORM set_config(v_flag, 'on', true);
  SET CONSTRAINTS ALL DEFERRED;

  -- Phase 1: park numbers out of the way so unique constraints cannot collide.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_idx := v_idx + 1;
    EXECUTE format('UPDATE %I SET number = $2 WHERE id = $1', p_table)
      USING (v_item ->> 'id')::uuid, -(1000000 + v_idx);
  END LOOP;

  -- Phase 2: apply the requested numbering and order.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    EXECUTE format('UPDATE %I SET number = $2, order_index = $3 WHERE id = $1', p_table)
      USING (v_item ->> 'id')::uuid, (v_item ->> 'number')::int, (v_item ->> 'order_index')::int;
  END LOOP;

  PERFORM set_config(v_flag, v_prev_flag, true);

  -- Canonical resequence, once, from the freshly written order. Runs with the
  -- version bump suppressed, so a renumber never makes an in-progress edit
  -- elsewhere look stale.
  IF p_table IN ('wp_draft_tasks', 'wp_draft_deliverables', 'proposal_milestones') THEN
    FOREACH v_parent IN ARRAY COALESCE(v_parents, '{}') LOOP
      PERFORM public.resequence_numbered(p_table, v_parent);
      -- A task renumber moves the deliverables whose secondary sort is the
      -- lowest linked task number.
      IF p_table = 'wp_draft_tasks' THEN
        PERFORM public.resequence_numbered('wp_draft_deliverables', v_parent);
      END IF;
    END LOOP;
  END IF;

  -- Hand back the authoritative rows AFTER the resequence, so the client never
  -- caches numbering the database has already moved on from.
  EXECUTE format(
    'SELECT COALESCE(jsonb_agg(to_jsonb(t.*) ORDER BY t.number), ''[]''::jsonb) FROM %I t WHERE t.id = ANY($1)', p_table)
    INTO v_rows
    USING ARRAY(SELECT (value ->> 'id')::uuid FROM jsonb_array_elements(p_items));

  RETURN jsonb_build_object('ok', true, 'conflict', false, 'rows', v_rows);
END;
$function$;