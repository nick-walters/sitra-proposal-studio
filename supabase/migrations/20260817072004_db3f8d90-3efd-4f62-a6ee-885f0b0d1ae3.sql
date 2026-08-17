-- ---------- soft delete card ----------
CREATE OR REPLACE FUNCTION public.soft_delete_card(p_card_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  PERFORM set_config('app.card_bin_ok', '0', true);
END;
$$;

-- ---------- soft delete field ----------
CREATE OR REPLACE FUNCTION public.soft_delete_card_field(p_field_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  PERFORM set_config('app.card_bin_ok', '0', true);
END;
$$;

-- ---------- normalise free band ----------
CREATE OR REPLACE FUNCTION public.normalise_section_card_order(p_section_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SET CONSTRAINTS ALL DEFERRED;
  UPDATE public.proposal_cards c
     SET order_index = s.new_idx
    FROM (
      SELECT id, 99 + row_number() OVER (ORDER BY order_index, created_at) AS new_idx
        FROM public.proposal_cards
       WHERE section_id = p_section_id AND anchor = 'free' AND deleted_at IS NULL
    ) s
   WHERE c.id = s.id AND c.order_index IS DISTINCT FROM s.new_idx;
END;
$$;

-- ---------- restore card ----------
CREATE OR REPLACE FUNCTION public.restore_card(p_card_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_card public.proposal_cards%ROWTYPE;
  v_idx integer;
  v_taken boolean;
BEGIN
  SELECT * INTO v_card FROM public.proposal_cards WHERE id = p_card_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
  IF NOT (public.is_coordinator_or_above(auth.uid()) AND public.is_proposal_admin(auth.uid(), v_card.proposal_id)) THEN
    RAISE EXCEPTION 'Permission denied: coordinator or above required';
  END IF;
  IF v_card.deleted_at IS NULL THEN RETURN; END IF;

  v_idx := v_card.order_index;
  SELECT EXISTS (
    SELECT 1 FROM public.proposal_cards
     WHERE section_id = v_card.section_id AND deleted_at IS NULL AND order_index = v_idx
  ) INTO v_taken;

  IF v_card.origin = 'manual' OR v_taken THEN
    IF v_card.anchor = 'free' THEN
      SELECT COALESCE(max(order_index), 99) + 1 INTO v_idx
        FROM public.proposal_cards
       WHERE section_id = v_card.section_id AND anchor = 'free' AND deleted_at IS NULL;
    ELSIF v_taken THEN
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

  PERFORM public.normalise_section_card_order(v_card.section_id);
  PERFORM set_config('app.card_bin_ok', '0', true);
END;
$$;

-- ---------- restore field ----------
CREATE OR REPLACE FUNCTION public.restore_card_field(p_field_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_field public.card_fields%ROWTYPE;
  v_card_deleted boolean;
  v_restored_card boolean := false;
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
  UPDATE public.card_fields
     SET deleted_at = NULL, deleted_by = NULL, deleted_with_card = false
   WHERE id = p_field_id;
  UPDATE public.card_deletions
     SET restored_at = now(), restored_by = auth.uid()
   WHERE restored_at IS NULL AND target_type = 'field' AND target_id = p_field_id;
  PERFORM set_config('app.card_bin_ok', '0', true);

  RETURN jsonb_build_object('restored_field', true, 'restored_parent_card', v_restored_card, 'card_id', v_field.card_id);
END;
$$;

-- ---------- purge ----------
CREATE OR REPLACE FUNCTION public.purge_deleted_cards()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_field_ids uuid[];
  v_card_ids uuid[];
  v_count integer := 0;
BEGIN
  SELECT array_agg(target_id) INTO v_field_ids FROM public.card_deletions
   WHERE target_type = 'field' AND restored_at IS NULL AND purge_after IS NOT NULL AND purge_after < now();
  SELECT array_agg(target_id) INTO v_card_ids FROM public.card_deletions
   WHERE target_type = 'card' AND restored_at IS NULL AND purge_after IS NOT NULL AND purge_after < now();

  PERFORM set_config('app.card_bin_ok', '1', true);

  IF v_card_ids IS NOT NULL THEN
    DELETE FROM public.card_field_versions v
     USING public.card_fields f
     WHERE v.field_id = f.id AND f.card_id = ANY(v_card_ids);
  END IF;
  IF v_field_ids IS NOT NULL THEN
    DELETE FROM public.card_field_versions WHERE field_id = ANY(v_field_ids);
    DELETE FROM public.card_fields WHERE id = ANY(v_field_ids) AND deleted_at IS NOT NULL;
  END IF;
  IF v_card_ids IS NOT NULL THEN
    DELETE FROM public.card_fields WHERE card_id = ANY(v_card_ids);
    DELETE FROM public.proposal_cards WHERE id = ANY(v_card_ids) AND deleted_at IS NOT NULL;
  END IF;

  WITH d AS (
    DELETE FROM public.card_deletions
     WHERE restored_at IS NULL AND purge_after IS NOT NULL AND purge_after < now()
    RETURNING 1
  ) SELECT count(*) INTO v_count FROM d;

  PERFORM set_config('app.card_bin_ok', '0', true);
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.purge_deleted_cards() FROM authenticated;

-- ---------- retention on submission ----------
CREATE OR REPLACE FUNCTION public.set_card_bin_retention_on_submit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'submitted' THEN
      UPDATE public.card_deletions
         SET purge_after = now() + interval '30 days'
       WHERE proposal_id = NEW.id AND restored_at IS NULL;
    ELSIF OLD.status = 'submitted' THEN
      UPDATE public.card_deletions
         SET purge_after = NULL
       WHERE proposal_id = NEW.id AND restored_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_card_bin_retention
  AFTER UPDATE OF status ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.set_card_bin_retention_on_submit();

-- ---------- seeding ----------
CREATE OR REPLACE FUNCTION public.seed_proposal_cards(p_proposal_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prop record;
  t record;
  v_section_id uuid;
  v_idx integer;
  v_card_id uuid;
  v_created integer := 0;
  v_field jsonb;
  v_pos integer;
BEGIN
  SELECT id, template_type_id, budget_type, COALESCE(uses_fstp, false) AS uses_fstp, status
    INTO v_prop FROM public.proposals WHERE id = p_proposal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;
  IF NOT (public.is_coordinator_or_above(auth.uid()) AND public.is_proposal_admin(auth.uid(), p_proposal_id)) THEN
    RAISE EXCEPTION 'Permission denied: coordinator or above required';
  END IF;
  IF v_prop.template_type_id IS NULL THEN RETURN 0; END IF;

  FOR t IN
    SELECT * FROM public.card_templates
     WHERE template_type_id = v_prop.template_type_id
       AND is_active
       AND (condition_budget_type IS NULL OR condition_budget_type = v_prop.budget_type)
       AND (condition_uses_fstp IS NULL OR condition_uses_fstp = v_prop.uses_fstp)
     ORDER BY document, section_number, anchor, order_index
  LOOP
    SELECT pts.id INTO v_section_id
      FROM public.proposal_template_sections pts
      JOIN public.proposal_templates pt ON pt.id = pts.proposal_template_id
     WHERE pt.proposal_id = p_proposal_id
       AND (
         (t.section_source_id IS NOT NULL AND pts.source_section_id = t.section_source_id)
         OR pts.section_number = t.section_number
       )
     ORDER BY (t.section_source_id IS NOT NULL AND pts.source_section_id = t.section_source_id) DESC
     LIMIT 1;

    IF v_section_id IS NULL THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.proposal_cards
                WHERE proposal_id = p_proposal_id AND template_key = t.key) THEN
      CONTINUE;
    END IF;

    IF t.anchor = 'head' THEN
      SELECT COALESCE(max(order_index) + 10, 0) INTO v_idx FROM public.proposal_cards
       WHERE section_id = v_section_id AND anchor = 'head';
    ELSIF t.anchor = 'tail' THEN
      SELECT COALESCE(max(order_index) + 10, 1000) INTO v_idx FROM public.proposal_cards
       WHERE section_id = v_section_id AND anchor = 'tail';
    ELSE
      SELECT COALESCE(max(order_index) + 1, 100) INTO v_idx FROM public.proposal_cards
       WHERE section_id = v_section_id AND anchor = 'free';
    END IF;

    INSERT INTO public.proposal_cards (
      proposal_id, section_id, document, kind, template_key, title, order_index, anchor,
      is_deletable, is_hideable, is_source_fed, is_fixed_position, is_visible,
      source_key, render_group, origin
    ) VALUES (
      p_proposal_id, v_section_id, t.document, t.kind, t.key, t.default_title, v_idx, t.anchor,
      t.is_deletable, t.is_hideable, t.is_source_fed, t.is_fixed_position, t.default_visible,
      t.source_key, t.render_group, 'auto'
    )
    ON CONFLICT (proposal_id, template_key) DO NOTHING
    RETURNING id INTO v_card_id;

    IF v_card_id IS NULL THEN CONTINUE; END IF;
    v_created := v_created + 1;

    IF t.default_fields IS NOT NULL AND jsonb_typeof(t.default_fields) = 'array' THEN
      v_pos := 0;
      FOR v_field IN SELECT * FROM jsonb_array_elements(t.default_fields) LOOP
        INSERT INTO public.card_fields (
          card_id, proposal_id, heading, content_html, order_index, field_role, origin
        ) VALUES (
          v_card_id, p_proposal_id,
          NULLIF(v_field->>'heading', ''),
          COALESCE(v_field->>'content_html', ''),
          v_pos,
          COALESCE(v_field->>'field_role', 'narrative'),
          'auto'
        );
        v_pos := v_pos + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_created;
END;
$$;