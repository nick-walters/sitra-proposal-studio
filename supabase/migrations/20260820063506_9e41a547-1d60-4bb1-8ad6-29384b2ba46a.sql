CREATE OR REPLACE FUNCTION public.numbered_parent_column(p_table text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_table
    WHEN 'wp_draft_tasks'        THEN 'wp_draft_id'
    WHEN 'wp_draft_deliverables' THEN 'wp_draft_id'
    WHEN 'proposal_milestones'   THEN 'proposal_id'
    WHEN 'proposal_risks'        THEN 'proposal_id'
    WHEN 'wp_drafts'             THEN 'proposal_id'
  END;
$$;

CREATE OR REPLACE FUNCTION public.numbered_order_expr(p_table text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_table
    WHEN 'proposal_milestones' THEN '(due_month IS NULL), due_month, order_index, id'
    WHEN 'proposal_risks'      THEN 'order_index, created_at, id'
    ELSE 'order_index, number, id'
  END;
$$;

CREATE OR REPLACE FUNCTION public.resequence_numbered(p_table text, p_parent_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent text := public.numbered_parent_column(p_table);
  v_order  text := public.numbered_order_expr(p_table);
  v_count  integer := 0;
BEGIN
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'Table % is not a numbered list', p_table;
  END IF;

  EXECUTE format(
    'UPDATE %1$I t SET number = -(1000000 + s.rn)
       FROM (SELECT id, row_number() OVER (ORDER BY %2$s) rn FROM %1$I WHERE %3$I = $1) s
      WHERE t.id = s.id', p_table, v_order, v_parent) USING p_parent_id;

  EXECUTE format(
    'UPDATE %1$I t SET number = s.rn, order_index = s.rn - 1
       FROM (SELECT id, row_number() OVER (ORDER BY (-number)) rn FROM %1$I WHERE %2$I = $1) s
      WHERE t.id = s.id', p_table, v_parent) USING p_parent_id;

  EXECUTE format('SELECT count(*) FROM %I WHERE %I = $1', p_table, v_parent)
    INTO v_count USING p_parent_id;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_and_resequence(
  p_table text,
  p_id uuid,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_parent text := public.numbered_parent_column(p_table);
  v_pid uuid;
  v_cur integer;
  v_parent_id uuid;
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

  RETURN jsonb_build_object(
    'ok', true, 'conflict', false,
    'remaining', public.resequence_numbered(p_table, v_parent_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.move_child_to_wp(
  p_table text,
  p_id uuid,
  p_target_wp_draft_id uuid,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid uuid;
  v_target_pid uuid;
  v_cur integer;
  v_source uuid;
  v_next integer;
BEGIN
  IF p_table NOT IN ('wp_draft_tasks','wp_draft_deliverables') THEN
    RAISE EXCEPTION 'Table % cannot be moved between work packages', p_table;
  END IF;

  v_pid := public.versioned_row_proposal(p_table, p_id);
  SELECT proposal_id INTO v_target_pid FROM public.wp_drafts WHERE id = p_target_wp_draft_id;
  IF v_pid IS NULL OR v_target_pid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'error', 'not_found');
  END IF;
  IF v_pid <> v_target_pid THEN
    RAISE EXCEPTION 'Cannot move between proposals';
  END IF;
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), v_pid) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  EXECUTE format('SELECT version, wp_draft_id FROM %I WHERE id = $1', p_table)
    INTO v_cur, v_source USING p_id;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_cur THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'version', v_cur);
  END IF;
  IF v_source = p_target_wp_draft_id THEN
    RETURN jsonb_build_object('ok', true, 'conflict', false, 'moved', false);
  END IF;

  EXECUTE format('SELECT COALESCE(max(number), 0) + 1 FROM %I WHERE wp_draft_id = $1', p_table)
    INTO v_next USING p_target_wp_draft_id;

  EXECUTE format(
    'UPDATE %I SET wp_draft_id = $2, number = $3,
        order_index = (SELECT count(*) FROM %I WHERE wp_draft_id = $2)
      WHERE id = $1', p_table, p_table)
    USING p_id, p_target_wp_draft_id, v_next;

  PERFORM public.resequence_numbered(p_table, v_source);
  PERFORM public.resequence_numbered(p_table, p_target_wp_draft_id);

  RETURN jsonb_build_object('ok', true, 'conflict', false, 'moved', true);
END;
$$;

REVOKE ALL ON FUNCTION public.numbered_parent_column(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.numbered_order_expr(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resequence_numbered(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_and_resequence(text, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.move_child_to_wp(text, uuid, uuid, integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.numbered_parent_column(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.numbered_order_expr(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resequence_numbered(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_and_resequence(text, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.move_child_to_wp(text, uuid, uuid, integer) TO authenticated, service_role;