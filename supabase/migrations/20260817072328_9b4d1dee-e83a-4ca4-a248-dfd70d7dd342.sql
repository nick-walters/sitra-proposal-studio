-- Reorder free-band cards within a section, atomically.
CREATE OR REPLACE FUNCTION public.reorder_section_cards(p_section_id uuid, p_card_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  UPDATE public.proposal_cards c
     SET order_index = s.new_idx
    FROM (
      SELECT id, 99 + ord AS new_idx
        FROM unnest(p_card_ids) WITH ORDINALITY AS u(id, ord)
    ) s
   WHERE c.id = s.id AND c.order_index IS DISTINCT FROM s.new_idx;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  PERFORM public.normalise_section_card_order(p_section_id);
  RETURN v_updated;
END;
$$;

-- Reorder the fields of a card, atomically.
CREATE OR REPLACE FUNCTION public.reorder_card_fields(p_card_id uuid, p_field_ids uuid[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_proposal_id uuid;
  v_updated integer := 0;
BEGIN
  SELECT proposal_id INTO v_proposal_id FROM public.proposal_cards WHERE id = p_card_id;
  IF v_proposal_id IS NULL THEN RAISE EXCEPTION 'Card not found'; END IF;
  IF NOT public.can_edit_proposal(auth.uid(), v_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.card_fields
     WHERE id = ANY(p_field_ids) AND (card_id <> p_card_id OR deleted_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Only live fields of this card can be reordered';
  END IF;

  SET CONSTRAINTS ALL DEFERRED;
  UPDATE public.card_fields f
     SET order_index = s.new_idx
    FROM (
      SELECT id, (ord - 1) AS new_idx
        FROM unnest(p_field_ids) WITH ORDINALITY AS u(id, ord)
    ) s
   WHERE f.id = s.id AND f.order_index IS DISTINCT FROM s.new_idx;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- Append a version snapshot for a field, allocating the next version number safely.
CREATE OR REPLACE FUNCTION public.save_card_field_version(
  p_field_id uuid,
  p_content_html text,
  p_heading text DEFAULT NULL,
  p_is_auto_save boolean DEFAULT true
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_proposal_id uuid;
  v_next integer;
  v_last record;
BEGIN
  SELECT proposal_id INTO v_proposal_id FROM public.card_fields WHERE id = p_field_id;
  IF v_proposal_id IS NULL THEN RAISE EXCEPTION 'Field not found'; END IF;
  IF NOT public.can_edit_proposal(auth.uid(), v_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
  END IF;

  SELECT content_html, heading, version_number INTO v_last
    FROM public.card_field_versions
   WHERE field_id = p_field_id
   ORDER BY version_number DESC LIMIT 1;

  IF FOUND AND v_last.content_html IS NOT DISTINCT FROM p_content_html
           AND v_last.heading IS NOT DISTINCT FROM p_heading THEN
    RETURN v_last.version_number;
  END IF;

  SELECT COALESCE(max(version_number), 0) + 1 INTO v_next
    FROM public.card_field_versions WHERE field_id = p_field_id;

  INSERT INTO public.card_field_versions (
    field_id, proposal_id, version_number, content_html, heading, is_auto_save, created_by
  ) VALUES (
    p_field_id, v_proposal_id, v_next, p_content_html, p_heading, p_is_auto_save, auth.uid()
  );
  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_section_cards(uuid, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.reorder_card_fields(uuid, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.save_card_field_version(uuid, text, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.reorder_section_cards(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reorder_card_fields(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_card_field_version(uuid, text, text, boolean) TO authenticated;