CREATE OR REPLACE FUNCTION public.bin_target_row(p_target_type text, p_target_id uuid, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_table text; v_pid uuid; v_payload jsonb; v_links jsonb := '{}'::jsonb;
  v_parent_type text; v_parent_id uuid; v_res jsonb;
BEGIN
  v_table := CASE p_target_type
    WHEN 'wp_draft_task'        THEN 'wp_draft_tasks'
    WHEN 'wp_draft_deliverable' THEN 'wp_draft_deliverables'
    WHEN 'wp_draft_intro'       THEN 'wp_drafts'
    WHEN 'case_subsection'      THEN 'case_subsection_templates'
  END;
  IF v_table IS NULL THEN RAISE EXCEPTION 'Unknown bin target type: %', p_target_type; END IF;

  IF p_target_type = 'case_subsection' THEN
    SELECT proposal_id INTO v_pid FROM public.case_subsection_templates WHERE id = p_target_id;
  ELSE
    v_pid := public.versioned_row_proposal(v_table, p_target_id);
  END IF;
  IF v_pid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), v_pid) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
  END IF;

  -- The field before the first task is a COLUMN on wp_drafts, not a row: it is
  -- snapshotted and cleared rather than deleted and resequenced.
  IF p_target_type = 'wp_draft_intro' THEN
    SELECT jsonb_build_object(
             'wp_draft_id', w.id,
             'title', 'Field before the first task',
             'description_before_tasks', w.description_before_tasks,
             'intro_visible', w.intro_visible)
      INTO v_payload
      FROM public.wp_drafts w WHERE w.id = p_target_id;
    IF v_payload IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

    UPDATE public.wp_drafts SET description_before_tasks = NULL WHERE id = p_target_id;

    INSERT INTO public.card_deletions (
      proposal_id, section_id, target_type, target_id, parent_type, parent_id,
      payload, links, deleted_by)
    VALUES (v_pid, NULL, p_target_type, p_target_id, 'wp_draft', p_target_id,
            v_payload, '{}'::jsonb, auth.uid());

    RETURN jsonb_build_object('ok', true, 'conflict', false);
  END IF;

  EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE t.id = $1', v_table)
    INTO v_payload USING p_target_id;
  IF v_payload IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  IF p_target_type = 'wp_draft_task' THEN
    v_parent_type := 'wp_draft'; v_parent_id := (v_payload->>'wp_draft_id')::uuid;
    v_links := jsonb_build_object(
      'wp_draft_task_effort', COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM public.wp_draft_task_effort e WHERE e.task_id = p_target_id), '[]'::jsonb),
      'wp_draft_task_participants', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM public.wp_draft_task_participants p WHERE p.task_id = p_target_id), '[]'::jsonb),
      'wp_draft_deliverable_tasks', COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM public.wp_draft_deliverable_tasks d WHERE d.wp_draft_task_id = p_target_id), '[]'::jsonb)
    );
  ELSIF p_target_type = 'wp_draft_deliverable' THEN
    v_parent_type := 'wp_draft'; v_parent_id := (v_payload->>'wp_draft_id')::uuid;
    v_links := jsonb_build_object(
      'wp_draft_deliverable_tasks', COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM public.wp_draft_deliverable_tasks d WHERE d.deliverable_id = p_target_id), '[]'::jsonb)
    );
  ELSE
    v_parent_type := 'proposal'; v_parent_id := v_pid;
    v_links := jsonb_build_object(
      'case_draft_content', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'case_draft_id', c.id,
                 'value', COALESCE(c.subsection_content, '{}'::jsonb) -> (v_payload->>'key')))
          FROM public.case_drafts c
         WHERE c.proposal_id = v_pid
           AND COALESCE(c.subsection_content, '{}'::jsonb) ? (v_payload->>'key')), '[]'::jsonb)
    );
  END IF;

  IF p_target_type = 'case_subsection' THEN
    DELETE FROM public.case_subsection_templates WHERE id = p_target_id;
    UPDATE public.case_drafts
       SET subsection_content = COALESCE(subsection_content, '{}'::jsonb) - (v_payload->>'key')
     WHERE proposal_id = v_pid;
  ELSE
    v_res := public.delete_and_resequence(v_table, p_target_id, p_expected_version);
    IF NOT COALESCE((v_res->>'ok')::boolean, false) THEN RETURN v_res; END IF;
  END IF;

  INSERT INTO public.card_deletions (
    proposal_id, section_id, target_type, target_id, parent_type, parent_id,
    payload, links, deleted_by)
  VALUES (v_pid, NULL, p_target_type, p_target_id, v_parent_type, v_parent_id,
          v_payload, v_links, auth.uid());

  RETURN jsonb_build_object('ok', true, 'conflict', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_binned_target(p_deletion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d public.card_deletions%ROWTYPE; v_link jsonb; v_key text; v_wp uuid;
BEGIN
  SELECT * INTO d FROM public.card_deletions WHERE id = p_deletion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bin entry not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), d.proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
  END IF;
  IF d.restored_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_restored', true);
  END IF;

  IF d.target_type = 'card' THEN
    PERFORM public.restore_card(d.target_id);
    RETURN jsonb_build_object('ok', true, 'target_type', 'card');
  ELSIF d.target_type = 'field' THEN
    RETURN public.restore_card_field(d.target_id) || jsonb_build_object('ok', true);
  END IF;

  IF d.payload IS NULL THEN RAISE EXCEPTION 'Bin entry has no snapshot to restore'; END IF;

  IF d.target_type = 'wp_draft_intro' THEN
    IF NOT EXISTS (SELECT 1 FROM public.wp_drafts WHERE id = d.target_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'parent_missing');
    END IF;
    UPDATE public.wp_drafts
       SET description_before_tasks = COALESCE(d.payload->>'description_before_tasks', ''),
           intro_visible = COALESCE((d.payload->>'intro_visible')::boolean, true)
     WHERE id = d.target_id;

  ELSIF d.target_type = 'wp_draft_task' THEN
    v_wp := (d.payload->>'wp_draft_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.wp_drafts WHERE id = v_wp) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'parent_missing');
    END IF;
    INSERT INTO public.wp_draft_tasks
      SELECT * FROM jsonb_populate_record(NULL::public.wp_draft_tasks, d.payload);

    FOR v_link IN SELECT * FROM jsonb_array_elements(COALESCE(d.links->'wp_draft_task_effort', '[]'::jsonb)) LOOP
      INSERT INTO public.wp_draft_task_effort
        SELECT * FROM jsonb_populate_record(NULL::public.wp_draft_task_effort, v_link)
        ON CONFLICT DO NOTHING;
    END LOOP;
    FOR v_link IN SELECT * FROM jsonb_array_elements(COALESCE(d.links->'wp_draft_task_participants', '[]'::jsonb)) LOOP
      INSERT INTO public.wp_draft_task_participants
        SELECT * FROM jsonb_populate_record(NULL::public.wp_draft_task_participants, v_link)
        ON CONFLICT DO NOTHING;
    END LOOP;
    FOR v_link IN SELECT * FROM jsonb_array_elements(COALESCE(d.links->'wp_draft_deliverable_tasks', '[]'::jsonb)) LOOP
      IF EXISTS (SELECT 1 FROM public.wp_draft_deliverables WHERE id = (v_link->>'deliverable_id')::uuid) THEN
        INSERT INTO public.wp_draft_deliverable_tasks
          SELECT * FROM jsonb_populate_record(NULL::public.wp_draft_deliverable_tasks, v_link)
          ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    PERFORM public.resequence_numbered('wp_draft_tasks', v_wp);
    PERFORM public.resequence_numbered('wp_draft_deliverables', v_wp);

  ELSIF d.target_type = 'wp_draft_deliverable' THEN
    v_wp := (d.payload->>'wp_draft_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.wp_drafts WHERE id = v_wp) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'parent_missing');
    END IF;
    INSERT INTO public.wp_draft_deliverables
      SELECT * FROM jsonb_populate_record(NULL::public.wp_draft_deliverables, d.payload);

    FOR v_link IN SELECT * FROM jsonb_array_elements(COALESCE(d.links->'wp_draft_deliverable_tasks', '[]'::jsonb)) LOOP
      IF EXISTS (SELECT 1 FROM public.wp_draft_tasks WHERE id = (v_link->>'wp_draft_task_id')::uuid) THEN
        INSERT INTO public.wp_draft_deliverable_tasks
          SELECT * FROM jsonb_populate_record(NULL::public.wp_draft_deliverable_tasks, v_link)
          ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    PERFORM public.resequence_numbered('wp_draft_deliverables', v_wp);

  ELSIF d.target_type = 'case_subsection' THEN
    v_key := d.payload->>'key';
    INSERT INTO public.case_subsection_templates
      SELECT * FROM jsonb_populate_record(NULL::public.case_subsection_templates, d.payload)
      ON CONFLICT (id) DO NOTHING;
    FOR v_link IN SELECT * FROM jsonb_array_elements(COALESCE(d.links->'case_draft_content', '[]'::jsonb)) LOOP
      UPDATE public.case_drafts
         SET subsection_content = jsonb_set(
               COALESCE(subsection_content, '{}'::jsonb), ARRAY[v_key],
               COALESCE(v_link->'value', '""'::jsonb), true)
       WHERE id = (v_link->>'case_draft_id')::uuid;
    END LOOP;
  ELSE
    RAISE EXCEPTION 'Unknown bin target type: %', d.target_type;
  END IF;

  UPDATE public.card_deletions
     SET restored_at = now(), restored_by = auth.uid()
   WHERE id = p_deletion_id;

  RETURN jsonb_build_object('ok', true, 'target_type', d.target_type);
END;
$function$;