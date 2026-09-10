CREATE OR REPLACE FUNCTION public.restore_binned_target(p_deletion_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  d public.card_deletions%ROWTYPE; v_link jsonb; v_key text; v_wp uuid;
  v_payload jsonb; v_next integer;
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
    -- Take the parent work-package row lock BEFORE reading max(number): two
    -- concurrent restores into the same work package would otherwise compute
    -- the same next number and one would fail the unique constraint. Locking
    -- the single parent row serialises restores per work package (a plain
    -- retry loop would still race with the resequence that follows).
    PERFORM 1 FROM public.wp_drafts WHERE id = v_wp FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'parent_missing');
    END IF;

    -- Deletion resequences the survivors, so the original number is usually
    -- taken. Append to the end instead; the resequence below tidies up.
    SELECT COALESCE(MAX(number), 0) + 1 INTO v_next
      FROM public.wp_draft_tasks WHERE wp_draft_id = v_wp;
    v_payload := jsonb_set(d.payload, ARRAY['number'], to_jsonb(v_next), true);

    INSERT INTO public.wp_draft_tasks
      SELECT * FROM jsonb_populate_record(NULL::public.wp_draft_tasks, v_payload);

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
    PERFORM 1 FROM public.wp_drafts WHERE id = v_wp FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'parent_missing');
    END IF;

    SELECT COALESCE(MAX(number), 0) + 1 INTO v_next
      FROM public.wp_draft_deliverables WHERE wp_draft_id = v_wp;
    v_payload := jsonb_set(d.payload, ARRAY['number'], to_jsonb(v_next), true);

    INSERT INTO public.wp_draft_deliverables
      SELECT * FROM jsonb_populate_record(NULL::public.wp_draft_deliverables, v_payload);

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