CREATE OR REPLACE FUNCTION public.soft_delete_card(p_card_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_card public.proposal_cards%ROWTYPE;
BEGIN
  SELECT * INTO v_card FROM public.proposal_cards WHERE id = p_card_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
  IF NOT public.can_edit_proposal(auth.uid(), v_card.proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
  END IF;
  IF v_card.deleted_at IS NOT NULL THEN RETURN; END IF;
  IF NOT v_card.is_deletable THEN RAISE EXCEPTION 'This card cannot be deleted'; END IF;

  PERFORM set_config('app.card_bin_ok', '1', true);

  UPDATE public.proposal_cards SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_card_id;

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

CREATE OR REPLACE FUNCTION public.soft_delete_card_field(p_field_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_field public.card_fields%ROWTYPE; v_section uuid;
BEGIN
  SELECT * INTO v_field FROM public.card_fields WHERE id = p_field_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Field not found'; END IF;
  IF NOT public.can_edit_proposal(auth.uid(), v_field.proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
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
$function$;

CREATE OR REPLACE FUNCTION public.restore_card(p_card_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_card public.proposal_cards%ROWTYPE; v_idx integer;
BEGIN
  SELECT * INTO v_card FROM public.proposal_cards WHERE id = p_card_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
  IF NOT public.can_edit_proposal(auth.uid(), v_card.proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
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

CREATE OR REPLACE FUNCTION public.restore_card_field(p_field_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_field public.card_fields%ROWTYPE; v_card_deleted boolean; v_restored_card boolean := false; v_idx integer;
BEGIN
  SELECT * INTO v_field FROM public.card_fields WHERE id = p_field_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Field not found'; END IF;
  IF NOT public.can_edit_proposal(auth.uid(), v_field.proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
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
$function$;