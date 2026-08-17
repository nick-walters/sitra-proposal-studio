-- Helper: park deleted fields out of the live index range and renumber live fields 0..n-1.
CREATE OR REPLACE FUNCTION public.resequence_card_fields(p_card_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_park integer;
BEGIN
  SET CONSTRAINTS ALL DEFERRED;

  SELECT COALESCE(max(order_index), 9999) INTO v_park
    FROM public.card_fields WHERE card_id = p_card_id AND deleted_at IS NOT NULL AND order_index >= 10000;

  -- Park any deleted field still occupying a live slot.
  UPDATE public.card_fields f
     SET order_index = 10000 + s.rn + GREATEST(v_park - 9999, 0)
    FROM (
      SELECT id, row_number() OVER (ORDER BY order_index, created_at) AS rn
        FROM public.card_fields
       WHERE card_id = p_card_id AND deleted_at IS NOT NULL AND order_index < 10000
    ) s
   WHERE f.id = s.id;

  -- Renumber live fields contiguously from 0.
  UPDATE public.card_fields f
     SET order_index = s.rn - 1
    FROM (
      SELECT id, row_number() OVER (ORDER BY order_index, created_at) AS rn
        FROM public.card_fields
       WHERE card_id = p_card_id AND deleted_at IS NULL
    ) s
   WHERE f.id = s.id AND f.order_index IS DISTINCT FROM (s.rn - 1);
END;
$$;

REVOKE ALL ON FUNCTION public.resequence_card_fields(uuid) FROM public, anon, authenticated;

-- Reorder: renumber the whole card in one transaction, deleted rows parked away.
CREATE OR REPLACE FUNCTION public.reorder_card_fields(p_card_id uuid, p_field_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Park deleted fields so they cannot collide with the new live ordering.
  UPDATE public.card_fields f
     SET order_index = 10000 + s.rn
    FROM (
      SELECT id, row_number() OVER (ORDER BY order_index, created_at) AS rn
        FROM public.card_fields
       WHERE card_id = p_card_id AND deleted_at IS NOT NULL
    ) s
   WHERE f.id = s.id AND f.order_index IS DISTINCT FROM (10000 + s.rn);

  UPDATE public.card_fields f
     SET order_index = s.new_idx
    FROM (
      SELECT id, (ord - 1) AS new_idx
        FROM unnest(p_field_ids) WITH ORDINALITY AS u(id, ord)
    ) s
   WHERE f.id = s.id AND f.order_index IS DISTINCT FROM s.new_idx;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  -- Any live field not named in the list keeps a slot after the listed ones.
  PERFORM public.resequence_card_fields(p_card_id);
  RETURN v_updated;
END;
$$;

-- Soft delete a field: park it and close the gap, all in one transaction.
CREATE OR REPLACE FUNCTION public.soft_delete_card_field(p_field_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_field public.card_fields%ROWTYPE;
  v_section uuid;
BEGIN
  SELECT * INTO v_field FROM public.card_fields WHERE id = p_field_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Field not found'; END IF;
  IF NOT (public.is_coordinator_or_above(auth.uid()) AND public.is_proposal_admin(auth.uid(), v_field.proposal_id)) THEN
    RAISE EXCEPTION 'Permission denied: coordinator or above required';
  END IF;
  IF v_field.deleted_at IS NOT NULL THEN RETURN; END IF;

  SELECT section_id INTO v_section FROM public.proposal_cards WHERE id = v_field.card_id;

  PERFORM set_config('app.card_bin_ok', '1', true);
  UPDATE public.card_fields
     SET deleted_at = now(), deleted_by = auth.uid(), deleted_with_card = false
   WHERE id = p_field_id;
  INSERT INTO public.card_deletions (proposal_id, section_id, target_type, target_id, parent_card_id, deleted_by)
  VALUES (v_field.proposal_id, v_section, 'field', p_field_id, v_field.card_id, auth.uid());
  PERFORM public.resequence_card_fields(v_field.card_id);
  PERFORM set_config('app.card_bin_ok', '0', true);
END;
$$;

-- Restore a field into a guaranteed-free slot at the end of the card.
CREATE OR REPLACE FUNCTION public.restore_card_field(p_field_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_field public.card_fields%ROWTYPE;
  v_card_deleted boolean;
  v_restored_card boolean := false;
  v_idx integer;
BEGIN
  SELECT * INTO v_field FROM public.card_fields WHERE id = p_field_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Field not found'; END IF;
  IF NOT (public.is_coordinator_or_above(auth.uid()) AND public.is_proposal_admin(auth.uid(), v_field.proposal_id)) THEN
    RAISE EXCEPTION 'Permission denied: coordinator or above required';
  END IF;
  IF v_field.deleted_at IS NULL THEN
    RETURN jsonb_build_object('restored_field', false, 'restored_parent_card', false, 'card_id', v_field.card_id);
  END IF;

  SELECT deleted_at IS NOT NULL INTO v_card_deleted FROM public.proposal_cards WHERE id = v_field.card_id;
  IF v_card_deleted THEN
    PERFORM public.restore_card(v_field.card_id);
    v_restored_card := true;
  END IF;

  PERFORM set_config('app.card_bin_ok', '1', true);

  SELECT COALESCE(max(order_index), -1) + 1 INTO v_idx
    FROM public.card_fields WHERE card_id = v_field.card_id AND deleted_at IS NULL;

  UPDATE public.card_fields
     SET deleted_at = NULL, deleted_by = NULL, deleted_with_card = false,
         order_index = CASE WHEN order_index >= 10000 THEN v_idx ELSE order_index END
   WHERE id = p_field_id AND deleted_at IS NOT NULL;

  UPDATE public.card_deletions
     SET restored_at = now(), restored_by = auth.uid()
   WHERE restored_at IS NULL AND target_type = 'field' AND target_id = p_field_id;

  PERFORM public.resequence_card_fields(v_field.card_id);
  PERFORM set_config('app.card_bin_ok', '0', true);

  RETURN jsonb_build_object('restored_field', true, 'restored_parent_card', v_restored_card, 'card_id', v_field.card_id);
END;
$$;

-- Create a field server-side so the index can account for soft-deleted rows.
CREATE OR REPLACE FUNCTION public.create_card_field(
  p_card_id uuid,
  p_heading text DEFAULT NULL,
  p_content_html text DEFAULT '',
  p_field_role text DEFAULT 'narrative'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_card public.proposal_cards%ROWTYPE;
  v_idx integer;
  v_id uuid;
BEGIN
  SELECT * INTO v_card FROM public.proposal_cards WHERE id = p_card_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
  IF NOT public.can_edit_proposal(auth.uid(), v_card.proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
  END IF;

  PERFORM public.resequence_card_fields(p_card_id);

  SELECT COALESCE(max(order_index), -1) + 1 INTO v_idx
    FROM public.card_fields WHERE card_id = p_card_id AND deleted_at IS NULL;

  INSERT INTO public.card_fields (card_id, proposal_id, heading, content_html, order_index, field_role, origin)
  VALUES (p_card_id, v_card.proposal_id, NULLIF(btrim(COALESCE(p_heading, '')), ''), COALESCE(p_content_html, ''), v_idx, p_field_role, 'manual')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_card_field(uuid, text, text, text) TO authenticated;

-- Create a manual text card at the bottom of the free band, with two seed fields.
CREATE OR REPLACE FUNCTION public.create_manual_text_card(p_section_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  INSERT INTO public.card_fields (card_id, proposal_id, heading, content_html, order_index, field_role, origin)
  VALUES (v_card_id, v_proposal_id, 'New heading', '', 0, 'narrative', 'manual'),
         (v_card_id, v_proposal_id, NULL, '', 1, 'narrative', 'manual');

  RETURN v_card_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_manual_text_card(uuid) TO authenticated;

-- Data repairs -------------------------------------------------------------

-- Seeded cards lost their titles when the migration copied NULL legacy titles.
UPDATE public.proposal_cards c
   SET title = t.default_title
  FROM public.card_templates t
 WHERE c.template_key = t.key
   AND c.title IS NULL
   AND t.default_title IS NOT NULL;

-- References cards must not be hideable or deletable.
UPDATE public.proposal_cards c
   SET is_hideable = t.is_hideable, is_deletable = t.is_deletable
  FROM public.card_templates t
 WHERE c.template_key = t.key
   AND (c.is_hideable IS DISTINCT FROM t.is_hideable OR c.is_deletable IS DISTINCT FROM t.is_deletable);

-- Normalise existing field indices so no deleted row blocks a live slot.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT card_id FROM public.card_fields LOOP
    PERFORM public.resequence_card_fields(r.card_id);
  END LOOP;
END $$;