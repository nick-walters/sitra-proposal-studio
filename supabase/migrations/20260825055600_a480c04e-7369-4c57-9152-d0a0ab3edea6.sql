CREATE OR REPLACE FUNCTION public.migrate_b12_to_cards(p_proposal_id uuid, p_confirm_overwrite boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  s record;
  it record;
  v_card record;
  v_card_id uuid;
  v_field_id uuid;
  v_cards_created integer := 0;
  v_fields_created integer := 0;
  v_fields_updated integer := 0;
  v_fields_removed integer := 0;
  v_placeholders integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_pos integer;
  v_max_pos integer := 0;
BEGIN
  IF NOT p_confirm_overwrite THEN
    RETURN public.migrate_b12_to_cards(p_proposal_id);
  END IF;

  IF NOT public.can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'You do not have permission to edit this proposal';
  END IF;

  IF NOT (public.is_coordinator_or_above(auth.uid()) AND public.is_proposal_admin(auth.uid(), p_proposal_id)) THEN
    RAISE EXCEPTION 'Permission denied: coordinator or above required';
  END IF;

  v_cards_created := public.seed_proposal_cards(p_proposal_id);

  FOR s IN
    SELECT * FROM public.methodology_subsections
     WHERE proposal_id = p_proposal_id ORDER BY order_index
  LOOP
    SELECT * INTO v_card FROM public.proposal_cards
     WHERE proposal_id = p_proposal_id AND template_key = 'b12.' || s.key AND deleted_at IS NULL;

    IF v_card.id IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object('subsection', s.key, 'reason', 'no matching card template');
      CONTINUE;
    END IF;

    IF v_card.is_source_fed THEN
      v_skipped := v_skipped || jsonb_build_object('subsection', s.key, 'reason', 'source-fed card, content not copied');
      CONTINUE;
    END IF;

    UPDATE public.proposal_cards
       SET title = COALESCE(NULLIF(btrim(s.title), ''), title), is_visible = s.is_visible
     WHERE id = v_card.id;

    SELECT id INTO v_field_id FROM public.card_fields
     WHERE card_id = v_card.id AND order_index = 0 AND deleted_at IS NULL;

    IF v_field_id IS NULL THEN
      INSERT INTO public.card_fields (card_id, proposal_id, heading, content_html, order_index, field_role, origin)
      VALUES (v_card.id, p_proposal_id, NULL, COALESCE(s.content_html, ''), 0, 'narrative', 'auto');
      v_fields_created := v_fields_created + 1;
    ELSE
      UPDATE public.card_fields
         SET heading = NULL,
             content_html = COALESCE(s.content_html, ''),
             field_role = 'narrative',
             placeholder_case_type_id = NULL,
             origin = 'auto'
       WHERE id = v_field_id;
      v_fields_updated := v_fields_updated + 1;
    END IF;
  END LOOP;

  SELECT id INTO v_card_id FROM public.proposal_cards
   WHERE proposal_id = p_proposal_id AND template_key = 'b12.methodologies' AND deleted_at IS NULL;

  IF v_card_id IS NULL THEN
    v_skipped := v_skipped || jsonb_build_object('items', 'all', 'reason', 'methodologies card missing');
  ELSE
    FOR it IN
      SELECT * FROM public.methodology_items
       WHERE proposal_id = p_proposal_id ORDER BY order_index
    LOOP
      v_pos := it.order_index + 1;
      v_max_pos := GREATEST(v_max_pos, v_pos);

      SELECT id INTO v_field_id FROM public.card_fields
       WHERE card_id = v_card_id AND order_index = v_pos AND deleted_at IS NULL;

      IF it.kind = 'case_placeholder' THEN
        IF v_field_id IS NULL THEN
          INSERT INTO public.card_fields
            (card_id, proposal_id, heading, content_html, order_index, field_role, placeholder_case_type_id, origin)
          VALUES (v_card_id, p_proposal_id, NULL, '', v_pos, 'case_placeholder', it.case_type_id, 'auto');
          v_placeholders := v_placeholders + 1;
        ELSE
          UPDATE public.card_fields
             SET field_role = 'case_placeholder', placeholder_case_type_id = it.case_type_id,
                 heading = NULL, content_html = '', assigned_participant_id = NULL, origin = 'auto'
           WHERE id = v_field_id;
          v_placeholders := v_placeholders + 1;
        END IF;
      ELSE
        IF v_field_id IS NULL THEN
          INSERT INTO public.card_fields
            (card_id, proposal_id, heading, content_html, order_index, field_role, assigned_participant_id, origin)
          VALUES (v_card_id, p_proposal_id, NULLIF(btrim(it.heading), ''), COALESCE(it.content_html, ''),
                  v_pos, 'narrative', it.assigned_participant_id, 'manual');
          v_fields_created := v_fields_created + 1;
        ELSE
          UPDATE public.card_fields
             SET heading = NULLIF(btrim(it.heading), ''), content_html = COALESCE(it.content_html, ''),
                 assigned_participant_id = it.assigned_participant_id, field_role = 'narrative',
                 placeholder_case_type_id = NULL, origin = 'manual'
           WHERE id = v_field_id;
          v_fields_updated := v_fields_updated + 1;
        END IF;
      END IF;
    END LOOP;

    UPDATE public.card_fields
       SET deleted_at = now(), deleted_by = auth.uid()
     WHERE card_id = v_card_id
       AND deleted_at IS NULL
       AND order_index > v_max_pos;
    GET DIAGNOSTICS v_fields_removed = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'proposal_id', p_proposal_id,
    'confirmed_overwrite', true,
    'cards_created', v_cards_created,
    'fields_created', v_fields_created,
    'fields_updated', v_fields_updated,
    'fields_removed', v_fields_removed,
    'placeholders_created', v_placeholders,
    'skipped', v_skipped
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.migrate_b12_to_cards(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.migrate_b12_to_cards(uuid, boolean) TO authenticated;