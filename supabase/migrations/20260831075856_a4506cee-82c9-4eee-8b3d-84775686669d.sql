CREATE OR REPLACE FUNCTION public.save_case_draft_subsection(p_id uuid, p_key text, p_body text, p_heading text DEFAULT NULL::text, p_expected_body text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pid uuid;
  v_content jsonb;
  v_entry jsonb;
  v_current_body text;
  v_heading text;
  v_existing record;
  v_new_version integer;
  v_order integer;
BEGIN
  v_pid := public.versioned_row_proposal('case_drafts', p_id);
  IF v_pid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'conflict', false, 'error', 'not_found');
  END IF;
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), v_pid) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO v_existing FROM case_draft_subsections
   WHERE case_id = p_id AND subsection_key = p_key FOR UPDATE;

  IF FOUND THEN
    v_current_body := COALESCE(v_existing.content_html, '');
  ELSE
    -- Baseline for a key that has no row yet: the legacy jsonb map is READ
    -- here only, and never written back (prompt 179).
    SELECT COALESCE(subsection_content, '{}'::jsonb) INTO v_content FROM case_drafts WHERE id = p_id;
    v_entry := v_content -> p_key;
    v_current_body := CASE
      WHEN v_entry IS NULL THEN ''
      WHEN jsonb_typeof(v_entry) = 'string' THEN v_entry #>> '{}'
      ELSE COALESCE(v_entry ->> 'body', '')
    END;
  END IF;

  IF p_expected_body IS NOT NULL AND COALESCE(v_current_body, '') <> p_expected_body THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'value', v_current_body);
  END IF;

  v_heading := COALESCE(NULLIF(p_heading, ''), NULLIF(v_existing.heading, ''), '');

  SELECT COALESCE(order_index, 0) INTO v_order FROM case_subsection_templates
   WHERE proposal_id = v_pid AND key = p_key;

  INSERT INTO case_draft_subsections (case_id, proposal_id, subsection_key, content_html, heading, order_index)
  VALUES (p_id, v_pid, p_key, COALESCE(p_body, ''), v_heading, COALESCE(v_order, 0))
  ON CONFLICT (case_id, subsection_key) DO UPDATE
    SET content_html = EXCLUDED.content_html,
        heading = EXCLUDED.heading,
        version = case_draft_subsections.version + 1
  RETURNING version INTO v_new_version;

  RETURN jsonb_build_object('ok', true, 'conflict', false, 'version', v_new_version);
END;
$function$;