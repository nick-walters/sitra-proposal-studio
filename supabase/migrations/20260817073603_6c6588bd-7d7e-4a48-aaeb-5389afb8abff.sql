CREATE OR REPLACE FUNCTION public.migrate_b12_to_cards(p_proposal_id uuid)
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
  v_placeholders integer := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_pos integer;
BEGIN
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
      -- Source-fed cards (linked activities, references) project at render time.
      v_skipped := v_skipped || jsonb_build_object('subsection', s.key, 'reason', 'source-fed card, content not copied');
      CONTINUE;
    END IF;

    UPDATE public.proposal_cards
       SET title = s.title, is_visible = s.is_visible
     WHERE id = v_card.id;

    SELECT id INTO v_field_id FROM public.card_fields
     WHERE card_id = v_card.id AND order_index = 0 AND deleted_at IS NULL;

    IF v_field_id IS NULL THEN
      INSERT INTO public.card_fields (card_id, proposal_id, heading, content_html, order_index, field_role, origin)
      VALUES (v_card.id, p_proposal_id, NULL, COALESCE(s.content_html, ''), 0, 'narrative', 'auto');
      v_fields_created := v_fields_created + 1;
    ELSE
      UPDATE public.card_fields SET content_html = COALESCE(s.content_html, '') WHERE id = v_field_id;
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
                 heading = NULL, content_html = '', origin = 'auto'
           WHERE id = v_field_id;
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
                 assigned_participant_id = it.assigned_participant_id, field_role = 'narrative', origin = 'manual'
           WHERE id = v_field_id;
          v_fields_updated := v_fields_updated + 1;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'proposal_id', p_proposal_id,
    'cards_created', v_cards_created,
    'fields_created', v_fields_created,
    'fields_updated', v_fields_updated,
    'placeholders_created', v_placeholders,
    'skipped', v_skipped
  );
END;
$function$;