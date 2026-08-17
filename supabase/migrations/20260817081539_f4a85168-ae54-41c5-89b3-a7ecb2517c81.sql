CREATE OR REPLACE FUNCTION public.card_html_is_blank(p_html text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce(regexp_replace(coalesce(p_html, ''), '(<[^>]*>|&nbsp;|\s)', '', 'g'), '') = ''
$$;

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
  v_conflicts text[] := '{}';
BEGIN
  IF NOT (public.is_coordinator_or_above(auth.uid()) AND public.is_proposal_admin(auth.uid(), p_proposal_id)) THEN
    RAISE EXCEPTION 'Permission denied: coordinator or above required';
  END IF;

  v_cards_created := public.seed_proposal_cards(p_proposal_id);

  -- ── GUARD: refuse to overwrite anything edited on the cards page ──────────
  -- Detection = content comparison against the legacy source of truth.
  -- Blank targets (freshly seeded fields, empty paragraphs) are safe to fill.
  WITH b12_cards AS (
    SELECT c.id, c.template_key
      FROM public.proposal_cards c
     WHERE c.proposal_id = p_proposal_id
       AND c.template_key LIKE 'b12.%'
       AND c.deleted_at IS NULL
       AND c.is_source_fed = false
  ),
  expected AS (
    SELECT bc.id AS card_id, 0 AS order_index, NULL::text AS heading,
           COALESCE(ms.content_html, '') AS content_html
      FROM public.methodology_subsections ms
      JOIN b12_cards bc ON bc.template_key = 'b12.' || ms.key
     WHERE ms.proposal_id = p_proposal_id
    UNION ALL
    SELECT bc.id, mi.order_index + 1,
           CASE WHEN mi.kind = 'case_placeholder' THEN NULL ELSE NULLIF(btrim(mi.heading), '') END,
           CASE WHEN mi.kind = 'case_placeholder' THEN '' ELSE COALESCE(mi.content_html, '') END
      FROM public.methodology_items mi
      JOIN b12_cards bc ON bc.template_key = 'b12.methodologies'
     WHERE mi.proposal_id = p_proposal_id
  ),
  actual AS (
    SELECT f.id, f.card_id, f.order_index, f.heading, f.content_html, f.deleted_at
      FROM public.card_fields f
      JOIN b12_cards bc ON bc.id = f.card_id
  )
  SELECT array_agg(msg) INTO v_conflicts FROM (
    SELECT format('card %s, field position %s: content differs from the source', a.card_id, a.order_index) AS msg
      FROM actual a
      JOIN expected e ON e.card_id = a.card_id AND e.order_index = a.order_index
     WHERE a.deleted_at IS NULL
       AND NOT public.card_html_is_blank(a.content_html)
       AND (COALESCE(a.content_html, '') IS DISTINCT FROM e.content_html
            OR COALESCE(a.heading, '') IS DISTINCT FROM COALESCE(e.heading, ''))
    UNION ALL
    SELECT format('card %s, field position %s: deleted on the cards page', a.card_id, a.order_index)
      FROM actual a
      JOIN expected e ON e.card_id = a.card_id AND e.order_index = a.order_index
     WHERE a.deleted_at IS NOT NULL
    UNION ALL
    SELECT format('card %s, field position %s: added on the cards page', a.card_id, a.order_index)
      FROM actual a
      LEFT JOIN expected e ON e.card_id = a.card_id AND e.order_index = a.order_index
     WHERE a.deleted_at IS NULL
       AND e.card_id IS NULL
       AND (NOT public.card_html_is_blank(a.content_html) OR a.heading IS NOT NULL)
  ) conflicts;

  IF v_conflicts IS NOT NULL AND array_length(v_conflicts, 1) > 0 THEN
    RAISE EXCEPTION 'migrate_b12_to_cards aborted: B1.2 cards for proposal % have been edited since migration (% conflict(s)). First conflicts: %',
      p_proposal_id, array_length(v_conflicts, 1), array_to_string(v_conflicts[1:5], '; ');
  END IF;
  -- ───────────────────────────────────────────────────────────────────────────

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

REVOKE EXECUTE ON FUNCTION public.card_html_is_blank(text) FROM anon;