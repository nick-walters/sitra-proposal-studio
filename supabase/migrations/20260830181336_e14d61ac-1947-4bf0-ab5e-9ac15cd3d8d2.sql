CREATE OR REPLACE FUNCTION public.restore_target_version(p_version_id uuid, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v public.card_field_versions%ROWTYPE;
  v_table text; v_value text; v_res jsonb;
BEGIN
  SELECT * INTO v FROM public.card_field_versions WHERE id = p_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Version not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), v.proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
  END IF;

  v_value := CASE WHEN v.target_type = 'card_field' AND v.text_box = 'header'
                  THEN v.heading ELSE v.content_html END;
  v_table := public.version_target_table(v.target_type);

  IF v.target_type = 'card_field' THEN
    UPDATE public.card_fields
       SET heading      = CASE WHEN v.text_box = 'header'  THEN v_value ELSE heading END,
           content_html = CASE WHEN v.text_box = 'content' THEN v_value ELSE content_html END
     WHERE id = v.target_id;
    v_res := jsonb_build_object('ok', true, 'conflict', false);
  ELSIF v.target_type = 'case_draft_subsection' THEN
    -- The editor reads case_draft_subsections, so the restore must land there.
    -- save_case_draft_subsection writes that row AND keeps the legacy
    -- case_drafts.subsection_content map in step.
    v_res := public.save_case_draft_subsection(
      v.target_id, v.text_box, COALESCE(v_value, ''), NULL, NULL);
  ELSE
    v_res := public.save_versioned_row(
      v_table, v.target_id, jsonb_build_object(v.text_box, v_value), p_expected_version);
  END IF;

  IF COALESCE((v_res->>'conflict')::boolean, false) OR NOT COALESCE((v_res->>'ok')::boolean, false) THEN
    RETURN v_res;
  END IF;

  PERFORM public.save_target_version(v.target_type, v.target_id, v.text_box, v_value, false);
  RETURN v_res;
END;
$function$;