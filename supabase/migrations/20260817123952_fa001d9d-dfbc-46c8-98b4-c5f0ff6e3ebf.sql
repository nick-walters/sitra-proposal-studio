CREATE OR REPLACE FUNCTION public.thin_card_field_versions(p_proposal_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  deleted_count integer := 0;
  r record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: caller cannot edit this proposal';
  END IF;

  PERFORM set_config('app.card_bin_ok', '1', true);

  FOR r IN
    WITH latest_per_box AS (
      SELECT DISTINCT ON (field_id, text_box) id
      FROM card_field_versions
      WHERE proposal_id = p_proposal_id
      ORDER BY field_id, text_box, version_number DESC
    ),
    candidates AS (
      SELECT cv.id,
        ROW_NUMBER() OVER (
          PARTITION BY cv.field_id, cv.text_box,
            CASE
              WHEN cv.created_at > now() - interval '7 days' THEN 'keep_all'
              WHEN cv.created_at > now() - interval '30 days' THEN date_trunc('hour', cv.created_at)::text
              WHEN cv.created_at > now() - interval '90 days' THEN date_trunc('day', cv.created_at)::text
              ELSE date_trunc('week', cv.created_at)::text
            END
          ORDER BY cv.created_at DESC
        ) AS rn,
        CASE WHEN cv.created_at > now() - interval '7 days' THEN 'keep_all' ELSE 'thin' END AS age_bucket
      FROM card_field_versions cv
      WHERE cv.proposal_id = p_proposal_id
        AND cv.is_auto_save = true
        AND cv.version_number > 1
        AND cv.id NOT IN (SELECT id FROM latest_per_box)
    )
    SELECT id FROM candidates
    WHERE age_bucket = 'thin' AND rn > 1
  LOOP
    DELETE FROM card_field_versions WHERE id = r.id AND proposal_id = p_proposal_id;
    deleted_count := deleted_count + 1;
  END LOOP;

  PERFORM set_config('app.card_bin_ok', '0', true);

  RETURN deleted_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_manual_text_card(p_section_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_proposal_id uuid;
  v_idx integer;
  v_card_id uuid;
BEGIN
  SELECT pt.proposal_id INTO v_proposal_id
    FROM public.proposal_template_sections pts
    JOIN public.proposal_templates pt ON pt.id = pts.proposal_template_id
   WHERE pts.id = p_section_id;
  IF v_proposal_id IS NULL THEN RAISE EXCEPTION 'Section not found'; END IF;
  IF NOT public.can_edit_proposal(auth.uid(), v_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
  END IF;

  SET CONSTRAINTS ALL DEFERRED;

  SELECT GREATEST(COALESCE(max(order_index), 99) + 1, 100) INTO v_idx
    FROM public.proposal_cards
   WHERE section_id = p_section_id AND anchor = 'free';

  INSERT INTO public.proposal_cards (
    proposal_id, section_id, document, kind, template_key, title, order_index, anchor,
    is_deletable, is_hideable, is_source_fed, is_fixed_position, is_visible, origin
  ) VALUES (
    v_proposal_id, p_section_id, 'part_b', 'text', NULL, NULL, v_idx, 'free',
    true, true, false, false, true, 'manual'
  ) RETURNING id INTO v_card_id;

  INSERT INTO public.card_fields (card_id, proposal_id, heading, heading_enabled, content_html, order_index, field_role, origin)
  VALUES (v_card_id, v_proposal_id, NULL, true, '', 0, 'narrative', 'manual');

  RETURN v_card_id;
END;
$function$;