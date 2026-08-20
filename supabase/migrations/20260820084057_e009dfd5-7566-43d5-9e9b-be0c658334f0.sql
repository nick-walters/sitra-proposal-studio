-- 1. Version-bump carve-out: resequences must not look like user edits.
CREATE OR REPLACE FUNCTION public.bump_row_version()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.version := COALESCE(NEW.version, 1);
  ELSIF COALESCE(current_setting('app.no_version_bump', true), '') = 'on' THEN
    -- Automatic resequencing (numbering only). Keeping the version steady means
    -- another user's renumber cannot make an in-progress edit look stale.
    NEW.version := COALESCE(OLD.version, 1);
  ELSE
    NEW.version := COALESCE(OLD.version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$function$;

-- 2. The real ordering rules, including the deliverable branch.
CREATE OR REPLACE FUNCTION public.resequence_numbered(p_table text, p_parent_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parent text := public.numbered_parent_column(p_table);
  v_count  integer := 0;
  v_flag   text := 'app.reseq_' || p_table;
  v_prev_bump text;
  v_prev_flag text;
  v_src    text;
BEGIN
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'Table % is not a numbered list', p_table;
  END IF;

  -- Risks are manually ordered and carry no number: never renumber them.
  IF p_table = 'proposal_risks' THEN
    SELECT count(*) INTO v_count FROM public.proposal_risks WHERE proposal_id = p_parent_id;
    RETURN v_count;
  END IF;

  v_prev_bump := COALESCE(current_setting('app.no_version_bump', true), '');
  v_prev_flag := COALESCE(current_setting(v_flag, true), '');
  PERFORM set_config('app.no_version_bump', 'on', true);
  PERFORM set_config(v_flag, 'on', true);
  SET CONSTRAINTS ALL DEFERRED;

  IF p_table = 'wp_draft_deliverables' THEN
    v_src :=
      'SELECT d.id, row_number() OVER (ORDER BY (d.due_month IS NULL), d.due_month,
                COALESCE(lt.min_task_number, 2147483647), d.order_index, d.id) rn
         FROM wp_draft_deliverables d
         LEFT JOIN LATERAL (
           SELECT min(t.number) AS min_task_number
             FROM wp_draft_deliverable_tasks dt
             JOIN wp_draft_tasks t ON t.id = dt.wp_draft_task_id
            WHERE dt.deliverable_id = d.id
         ) lt ON true
        WHERE d.wp_draft_id = $1';
  ELSE
    v_src := format('SELECT id, row_number() OVER (ORDER BY %s) rn FROM %I WHERE %I = $1',
                    public.numbered_order_expr(p_table), p_table, v_parent);
  END IF;

  -- Phase 1: park numbers out of the way so unique constraints cannot collide.
  EXECUTE format('UPDATE %1$I t SET number = -(1000000 + s.rn) FROM (%2$s) s WHERE t.id = s.id',
                 p_table, v_src) USING p_parent_id;

  -- Phase 2: apply 1..n, and refresh order_index as a faithful cache of it.
  EXECUTE format(
    'UPDATE %1$I t SET number = s.rn, order_index = s.rn - 1
       FROM (SELECT id, row_number() OVER (ORDER BY (-number)) rn FROM %1$I WHERE %2$I = $1) s
      WHERE t.id = s.id', p_table, v_parent) USING p_parent_id;

  EXECUTE format('SELECT count(*) FROM %I WHERE %I = $1', p_table, v_parent)
    INTO v_count USING p_parent_id;

  PERFORM set_config('app.no_version_bump', v_prev_bump, true);
  PERFORM set_config(v_flag, v_prev_flag, true);
  RETURN v_count;
END;
$function$;

-- 3. Deleting a risk must not renumber the survivors.
CREATE OR REPLACE FUNCTION public.delete_and_resequence(p_table text, p_id uuid, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parent text := public.numbered_parent_column(p_table);
  v_pid uuid;
  v_cur integer;
  v_parent_id uuid;
  v_remaining integer;
BEGIN
  IF v_parent IS NULL OR NOT public.versioned_table_allowed(p_table) THEN
    RAISE EXCEPTION 'Table % is not a guarded numbered list', p_table;
  END IF;

  v_pid := public.versioned_row_proposal(p_table, p_id);
  IF v_pid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'error', 'not_found');
  END IF;
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), v_pid) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  EXECUTE format('SELECT version, %I FROM %I WHERE id = $1', v_parent, p_table)
    INTO v_cur, v_parent_id USING p_id;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_cur THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'version', v_cur);
  END IF;

  EXECUTE format('DELETE FROM %I WHERE id = $1', p_table) USING p_id;

  IF p_table = 'proposal_risks' THEN
    SELECT count(*) INTO v_remaining FROM public.proposal_risks WHERE proposal_id = v_parent_id;
  ELSE
    v_remaining := public.resequence_numbered(p_table, v_parent_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'conflict', false, 'remaining', v_remaining);
END;
$function$;