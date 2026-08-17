-- Allow deleted cards to be parked outside the live bands.
CREATE OR REPLACE FUNCTION public.validate_proposal_card()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_max_head integer;
  v_min_tail integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.document IS DISTINCT FROM OLD.document THEN
      RAISE EXCEPTION 'proposal_cards.document is immutable';
    END IF;
    IF NEW.kind IS DISTINCT FROM OLD.kind THEN
      RAISE EXCEPTION 'proposal_cards.kind is immutable';
    END IF;
    IF NEW.anchor IS DISTINCT FROM OLD.anchor THEN
      RAISE EXCEPTION 'proposal_cards.anchor cannot be changed';
    END IF;
    IF OLD.anchor IN ('head','tail') AND NEW.order_index IS DISTINCT FROM OLD.order_index
       AND NEW.deleted_at IS NULL AND OLD.deleted_at IS NULL THEN
      RAISE EXCEPTION 'Cards in the % band cannot be reordered', OLD.anchor;
    END IF;
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       AND COALESCE(current_setting('app.card_bin_ok', true), '') <> '1' THEN
      RAISE EXCEPTION 'deleted_at may only be changed by the card recycle-bin functions';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NOT NULL AND COALESCE(current_setting('app.card_bin_ok', true), '') <> '1' THEN
      RAISE EXCEPTION 'deleted_at may only be set by the card recycle-bin functions';
    END IF;
  END IF;

  IF NEW.is_fixed_position AND (NEW.is_deletable OR NEW.anchor = 'free') THEN
    RAISE EXCEPTION 'Fixed-position cards must be non-deletable and anchored to head or tail';
  END IF;

  -- Band ranges only apply to live cards; deleted cards park at >= 10000.
  IF NEW.deleted_at IS NULL THEN
    IF NEW.anchor = 'head' AND (NEW.order_index < 0 OR NEW.order_index > 99) THEN
      RAISE EXCEPTION 'Head-band cards require order_index 0-99 (got %)', NEW.order_index;
    ELSIF NEW.anchor = 'free' AND (NEW.order_index < 100 OR NEW.order_index > 999) THEN
      RAISE EXCEPTION 'Free-band cards require order_index 100-999 (got %)', NEW.order_index;
    ELSIF NEW.anchor = 'tail' AND NEW.order_index < 1000 THEN
      RAISE EXCEPTION 'Tail-band cards require order_index >= 1000 (got %)', NEW.order_index;
    END IF;

    IF NEW.anchor = 'free' THEN
      SELECT max(order_index) INTO v_max_head FROM public.proposal_cards
        WHERE section_id = NEW.section_id AND anchor = 'head' AND deleted_at IS NULL;
      SELECT min(order_index) INTO v_min_tail FROM public.proposal_cards
        WHERE section_id = NEW.section_id AND anchor = 'tail' AND deleted_at IS NULL;
      IF v_max_head IS NOT NULL AND NEW.order_index <= v_max_head THEN
        RAISE EXCEPTION 'A free card cannot be placed above the head band';
      END IF;
      IF v_min_tail IS NOT NULL AND NEW.order_index >= v_min_tail THEN
        RAISE EXCEPTION 'A free card cannot be placed within or below the tail band';
      END IF;
    END IF;
  ELSIF NEW.order_index < 10000 AND NEW.anchor = 'free' THEN
    -- deleted free cards are parked by resequence_section_cards; nothing to enforce here
    NULL;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resequence_section_cards(p_section_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_park integer;
BEGIN
  SET CONSTRAINTS ALL DEFERRED;

  SELECT COALESCE(max(order_index), 9999) INTO v_park
    FROM public.proposal_cards
   WHERE section_id = p_section_id AND deleted_at IS NOT NULL AND order_index >= 10000;

  -- Park deleted free-band cards still occupying a live slot.
  UPDATE public.proposal_cards c
     SET order_index = 10000 + s.rn + GREATEST(v_park - 9999, 0)
    FROM (
      SELECT id, row_number() OVER (ORDER BY order_index, created_at) AS rn
        FROM public.proposal_cards
       WHERE section_id = p_section_id AND deleted_at IS NOT NULL
         AND anchor = 'free' AND order_index < 10000
    ) s
   WHERE c.id = s.id;

  -- Renumber live free-band cards contiguously from 100.
  UPDATE public.proposal_cards c
     SET order_index = s.new_idx
    FROM (
      SELECT id, 99 + (row_number() OVER (ORDER BY order_index, created_at))::int AS new_idx
        FROM public.proposal_cards
       WHERE section_id = p_section_id AND anchor = 'free' AND deleted_at IS NULL
    ) s
   WHERE c.id = s.id AND c.order_index IS DISTINCT FROM s.new_idx;
END;
$function$;

CREATE OR REPLACE FUNCTION public.normalise_section_card_order(p_section_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.resequence_section_cards(p_section_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.reorder_section_cards(p_section_id uuid, p_card_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_proposal_id uuid;
  v_updated integer := 0;
BEGIN
  SELECT DISTINCT proposal_id INTO v_proposal_id FROM public.proposal_cards
   WHERE section_id = p_section_id LIMIT 1;
  IF v_proposal_id IS NULL THEN RETURN 0; END IF;
  IF NOT public.can_edit_proposal(auth.uid(), v_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.proposal_cards
     WHERE id = ANY(p_card_ids) AND (section_id <> p_section_id OR anchor <> 'free' OR deleted_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Only live free-band cards of this section can be reordered';
  END IF;

  SET CONSTRAINTS ALL DEFERRED;

  PERFORM public.resequence_section_cards(p_section_id);

  UPDATE public.proposal_cards c
     SET order_index = s.new_idx
    FROM (
      SELECT id, 99 + ord::int AS new_idx
        FROM unnest(p_card_ids) WITH ORDINALITY AS u(id, ord)
    ) s
   WHERE c.id = s.id AND c.order_index IS DISTINCT FROM s.new_idx;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  PERFORM public.resequence_section_cards(p_section_id);
  RETURN v_updated;
END;
$function$;

CREATE OR REPLACE FUNCTION public.soft_delete_card(p_card_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_card public.proposal_cards%ROWTYPE;
BEGIN
  SELECT * INTO v_card FROM public.proposal_cards WHERE id = p_card_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
  IF NOT (public.is_coordinator_or_above(auth.uid()) AND public.is_proposal_admin(auth.uid(), v_card.proposal_id)) THEN
    RAISE EXCEPTION 'Permission denied: coordinator or above required';
  END IF;
  IF v_card.deleted_at IS NOT NULL THEN RETURN; END IF;
  IF NOT v_card.is_deletable THEN
    RAISE EXCEPTION 'This card cannot be deleted';
  END IF;

  PERFORM set_config('app.card_bin_ok', '1', true);

  UPDATE public.proposal_cards
     SET deleted_at = now(), deleted_by = auth.uid()
   WHERE id = p_card_id;

  UPDATE public.card_fields
     SET deleted_at = now(), deleted_by = auth.uid(), deleted_with_card = true
   WHERE card_id = p_card_id AND deleted_at IS NULL;

  INSERT INTO public.card_deletions (proposal_id, section_id, target_type, target_id, deleted_by)
  VALUES (v_card.proposal_id, v_card.section_id, 'card', p_card_id, auth.uid());

  INSERT INTO public.card_deletions (proposal_id, section_id, target_type, target_id, parent_card_id, deleted_by)
  SELECT v_card.proposal_id, v_card.section_id, 'field', f.id, p_card_id, auth.uid()
    FROM public.card_fields f
   WHERE f.card_id = p_card_id AND f.deleted_with_card = true AND f.deleted_at IS NOT NULL;

  PERFORM public.resequence_section_cards(v_card.section_id);

  PERFORM set_config('app.card_bin_ok', '0', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_card(p_card_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_card public.proposal_cards%ROWTYPE;
  v_idx integer;
BEGIN
  SELECT * INTO v_card FROM public.proposal_cards WHERE id = p_card_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
  IF NOT (public.is_coordinator_or_above(auth.uid()) AND public.is_proposal_admin(auth.uid(), v_card.proposal_id)) THEN
    RAISE EXCEPTION 'Permission denied: coordinator or above required';
  END IF;
  IF v_card.deleted_at IS NULL THEN RETURN; END IF;

  SET CONSTRAINTS ALL DEFERRED;

  IF v_card.anchor = 'free' THEN
    SELECT COALESCE(max(order_index), 99) + 1 INTO v_idx
      FROM public.proposal_cards
     WHERE section_id = v_card.section_id AND anchor = 'free' AND deleted_at IS NULL;
  ELSE
    v_idx := v_card.order_index;
    IF EXISTS (
      SELECT 1 FROM public.proposal_cards
       WHERE section_id = v_card.section_id AND deleted_at IS NULL AND order_index = v_idx
    ) THEN
      SELECT COALESCE(max(order_index), CASE WHEN v_card.anchor = 'head' THEN -10 ELSE 990 END) + 10
        INTO v_idx
        FROM public.proposal_cards
       WHERE section_id = v_card.section_id AND anchor = v_card.anchor AND deleted_at IS NULL;
    END IF;
  END IF;

  PERFORM set_config('app.card_bin_ok', '1', true);

  UPDATE public.proposal_cards
     SET deleted_at = NULL, deleted_by = NULL, order_index = v_idx
   WHERE id = p_card_id;

  UPDATE public.card_fields
     SET deleted_at = NULL, deleted_by = NULL, deleted_with_card = false
   WHERE card_id = p_card_id AND deleted_at IS NOT NULL AND deleted_with_card = true;

  UPDATE public.card_deletions
     SET restored_at = now(), restored_by = auth.uid()
   WHERE restored_at IS NULL
     AND ((target_type = 'card' AND target_id = p_card_id)
       OR (target_type = 'field' AND parent_card_id = p_card_id
           AND target_id IN (SELECT id FROM public.card_fields
                              WHERE card_id = p_card_id AND deleted_at IS NULL)));

  PERFORM public.resequence_section_cards(v_card.section_id);
  PERFORM set_config('app.card_bin_ok', '0', true);
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

  PERFORM public.resequence_section_cards(p_section_id);

  SELECT GREATEST(COALESCE(max(order_index), 99) + 1, 100) INTO v_idx
    FROM public.proposal_cards
   WHERE section_id = p_section_id AND anchor = 'free' AND deleted_at IS NULL;

  INSERT INTO public.proposal_cards (
    proposal_id, section_id, document, kind, template_key, title, order_index, anchor,
    is_deletable, is_hideable, is_source_fed, is_fixed_position, is_visible, origin
  ) VALUES (
    v_proposal_id, p_section_id, 'part_b', 'text', NULL, NULL, v_idx, 'free',
    true, true, false, false, true, 'manual'
  ) RETURNING id INTO v_card_id;

  INSERT INTO public.card_fields (card_id, proposal_id, heading, heading_enabled, content_html, order_index, field_role, origin)
  VALUES (v_card_id, v_proposal_id, '', true, '', 0, 'narrative', 'manual');

  RETURN v_card_id;
END;
$function$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT section_id FROM public.proposal_cards LOOP
    PERFORM public.resequence_section_cards(r.section_id);
  END LOOP;
END $$;