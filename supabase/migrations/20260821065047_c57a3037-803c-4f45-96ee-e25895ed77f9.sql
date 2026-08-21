-- =====================================================================
-- Phase 3b: write paths for table and figure blocks.
-- Every function carries the SAME temporary beta guard as the other card
-- RPCs (see create_manual_text_card / create_card_field).
-- =====================================================================

-- Internal helper: resolve the proposal for a card and enforce edit rights.
CREATE OR REPLACE FUNCTION public.card_block_guard(p_card_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_proposal_id uuid;
BEGIN
  -- TEMPORARY DEVELOPMENT RESTRICTION (beta cards board, added 2026-08-18):
  -- platform owners/admins only (public.is_global_admin). MUST be relaxed to
  -- public.can_edit_proposal() at cutover, before the cards feature ships.
  IF NOT public.is_global_admin(auth.uid()) THEN
    RAISE EXCEPTION 'The cards board is restricted to platform owners during beta';
  END IF;

  SELECT proposal_id INTO v_proposal_id
    FROM public.proposal_cards WHERE id = p_card_id AND deleted_at IS NULL;
  IF v_proposal_id IS NULL THEN RAISE EXCEPTION 'Card not found'; END IF;
  IF NOT public.can_edit_proposal(auth.uid(), v_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
  END IF;
  RETURN v_proposal_id;
END;
$$;

REVOKE ALL ON FUNCTION public.card_block_guard(uuid) FROM PUBLIC, anon, authenticated;

-- ------------------------------------------------------------------ create
CREATE OR REPLACE FUNCTION public.create_table_card(
  p_section_id uuid,
  p_cols integer DEFAULT 3,
  p_rows integer DEFAULT 3,
  p_parts integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_proposal_id uuid;
  v_idx integer;
  v_card_id uuid;
  v_part integer;
  v_r integer;
  v_c integer;
  v_row_id uuid;
  v_cols integer := LEAST(GREATEST(COALESCE(p_cols, 3), 1), 12);
  v_rows integer := LEAST(GREATEST(COALESCE(p_rows, 3), 1), 60);
  v_parts integer := LEAST(GREATEST(COALESCE(p_parts, 1), 1), 2);
BEGIN
  -- TEMPORARY DEVELOPMENT RESTRICTION (beta cards board, added 2026-08-18):
  -- platform owners/admins only (public.is_global_admin). MUST be relaxed to
  -- public.can_edit_proposal() at cutover, before the cards feature ships.
  IF NOT public.is_global_admin(auth.uid()) THEN
    RAISE EXCEPTION 'The cards board is restricted to platform owners during beta';
  END IF;

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
    v_proposal_id, p_section_id, 'part_b', 'table', NULL, NULL, v_idx, 'free',
    true, true, false, false, true, 'manual'
  ) RETURNING id INTO v_card_id;

  INSERT INTO public.card_table (card_id, proposal_id, parts, variant)
  VALUES (v_card_id, v_proposal_id, v_parts, 'standard');

  FOR v_part IN 1..v_parts LOOP
    FOR v_c IN 0..(v_cols - 1) LOOP
      INSERT INTO public.card_table_columns (card_id, proposal_id, part, order_index)
      VALUES (v_card_id, v_proposal_id, v_part, v_c);
    END LOOP;

    FOR v_r IN 0..(v_rows - 1) LOOP
      INSERT INTO public.card_table_rows (card_id, proposal_id, part, order_index, row_type)
      VALUES (v_card_id, v_proposal_id, v_part, v_r, CASE WHEN v_r = 0 THEN 'header' ELSE 'body' END)
      RETURNING id INTO v_row_id;

      INSERT INTO public.card_table_cells (proposal_id, row_id, column_id, content_html)
      SELECT v_proposal_id, v_row_id, c.id, ''
        FROM public.card_table_columns c
       WHERE c.card_id = v_card_id AND c.part = v_part;
    END LOOP;
  END LOOP;

  RETURN v_card_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_figure_card(
  p_section_id uuid,
  p_figure_id uuid DEFAULT NULL
)
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
  -- TEMPORARY DEVELOPMENT RESTRICTION (beta cards board, added 2026-08-18):
  -- platform owners/admins only (public.is_global_admin). MUST be relaxed to
  -- public.can_edit_proposal() at cutover, before the cards feature ships.
  IF NOT public.is_global_admin(auth.uid()) THEN
    RAISE EXCEPTION 'The cards board is restricted to platform owners during beta';
  END IF;

  SELECT pt.proposal_id INTO v_proposal_id
    FROM public.proposal_template_sections pts
    JOIN public.proposal_templates pt ON pt.id = pts.proposal_template_id
   WHERE pts.id = p_section_id;
  IF v_proposal_id IS NULL THEN RAISE EXCEPTION 'Section not found'; END IF;
  IF NOT public.can_edit_proposal(auth.uid(), v_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
  END IF;

  IF p_figure_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.figures f WHERE f.id = p_figure_id AND f.proposal_id = v_proposal_id
  ) THEN
    RAISE EXCEPTION 'Figure not found in this proposal';
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
    v_proposal_id, p_section_id, 'part_b', 'figure', NULL, NULL, v_idx, 'free',
    true, true, false, false, true, 'manual'
  ) RETURNING id INTO v_card_id;

  INSERT INTO public.card_figure (card_id, proposal_id, figure_id, float)
  VALUES (v_card_id, v_proposal_id, p_figure_id, 'none');

  RETURN v_card_id;
END;
$$;

-- -------------------------------------------------------------- rows / cols
CREATE OR REPLACE FUNCTION public.add_card_table_row(
  p_card_id uuid,
  p_part integer DEFAULT 1,
  p_row_type text DEFAULT 'body'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_proposal_id uuid := public.card_block_guard(p_card_id);
  v_idx integer;
  v_row_id uuid;
BEGIN
  IF p_row_type NOT IN ('header', 'body') THEN RAISE EXCEPTION 'Invalid row type'; END IF;

  SELECT COALESCE(max(order_index), -1) + 1 INTO v_idx
    FROM public.card_table_rows WHERE card_id = p_card_id AND part = p_part;

  INSERT INTO public.card_table_rows (card_id, proposal_id, part, order_index, row_type)
  VALUES (p_card_id, v_proposal_id, p_part, v_idx, p_row_type)
  RETURNING id INTO v_row_id;

  INSERT INTO public.card_table_cells (proposal_id, row_id, column_id, content_html)
  SELECT v_proposal_id, v_row_id, c.id, ''
    FROM public.card_table_columns c
   WHERE c.card_id = p_card_id AND c.part = p_part;

  RETURN v_row_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_card_table_row(p_row_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.card_table_rows%ROWTYPE;
  v_cells integer;
  v_with_content integer;
BEGIN
  SELECT * INTO v_row FROM public.card_table_rows WHERE id = p_row_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Row not found'; END IF;
  PERFORM public.card_block_guard(v_row.card_id);

  SET CONSTRAINTS ALL DEFERRED;

  SELECT count(*), count(*) FILTER (WHERE NOT public.card_html_is_blank(content_html))
    INTO v_cells, v_with_content
    FROM public.card_table_cells WHERE row_id = p_row_id;

  DELETE FROM public.card_table_rows WHERE id = p_row_id;

  UPDATE public.card_table_rows
     SET order_index = order_index - 1
   WHERE card_id = v_row.card_id AND part = v_row.part AND order_index > v_row.order_index;

  RETURN jsonb_build_object('ok', true, 'deleted_cells', v_cells, 'cells_with_content', v_with_content);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_card_table_column(
  p_card_id uuid,
  p_part integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_proposal_id uuid := public.card_block_guard(p_card_id);
  v_idx integer;
  v_col_id uuid;
BEGIN
  SELECT COALESCE(max(order_index), -1) + 1 INTO v_idx
    FROM public.card_table_columns WHERE card_id = p_card_id AND part = p_part;

  INSERT INTO public.card_table_columns (card_id, proposal_id, part, order_index)
  VALUES (p_card_id, v_proposal_id, p_part, v_idx)
  RETURNING id INTO v_col_id;

  INSERT INTO public.card_table_cells (proposal_id, row_id, column_id, content_html)
  SELECT v_proposal_id, r.id, v_col_id, ''
    FROM public.card_table_rows r
   WHERE r.card_id = p_card_id AND r.part = p_part;

  RETURN v_col_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_card_table_column(p_column_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_col public.card_table_columns%ROWTYPE;
  v_cells integer;
  v_with_content integer;
  v_remaining integer;
BEGIN
  SELECT * INTO v_col FROM public.card_table_columns WHERE id = p_column_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Column not found'; END IF;
  PERFORM public.card_block_guard(v_col.card_id);

  SELECT count(*) INTO v_remaining
    FROM public.card_table_columns WHERE card_id = v_col.card_id AND part = v_col.part;
  IF v_remaining <= 1 THEN RAISE EXCEPTION 'A table must keep at least one column'; END IF;

  SET CONSTRAINTS ALL DEFERRED;

  SELECT count(*), count(*) FILTER (WHERE NOT public.card_html_is_blank(content_html))
    INTO v_cells, v_with_content
    FROM public.card_table_cells WHERE column_id = p_column_id;

  DELETE FROM public.card_table_columns WHERE id = p_column_id;

  UPDATE public.card_table_columns
     SET order_index = order_index - 1
   WHERE card_id = v_col.card_id AND part = v_col.part AND order_index > v_col.order_index;

  RETURN jsonb_build_object('ok', true, 'deleted_cells', v_cells, 'cells_with_content', v_with_content);
END;
$$;

-- ------------------------------------------------------------------- saves
CREATE OR REPLACE FUNCTION public.save_card_table_column(p_column_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_col public.card_table_columns%ROWTYPE;
BEGIN
  SELECT * INTO v_col FROM public.card_table_columns WHERE id = p_column_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Column not found'; END IF;
  PERFORM public.card_block_guard(v_col.card_id);

  UPDATE public.card_table_columns SET
    label_html = CASE WHEN p_patch ? 'label_html' THEN p_patch->>'label_html' ELSE label_html END,
    width_px   = CASE WHEN p_patch ? 'width_px'
                      THEN NULLIF(p_patch->>'width_px', '')::integer ELSE width_px END,
    align_h    = CASE WHEN p_patch ? 'align_h' THEN NULLIF(p_patch->>'align_h', '') ELSE align_h END,
    align_v    = CASE WHEN p_patch ? 'align_v' THEN NULLIF(p_patch->>'align_v', '') ELSE align_v END,
    updated_at = now()
  WHERE id = p_column_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_card_table_cell(p_cell_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_card_id uuid;
BEGIN
  SELECT r.card_id INTO v_card_id
    FROM public.card_table_cells c
    JOIN public.card_table_rows r ON r.id = c.row_id
   WHERE c.id = p_cell_id;
  IF v_card_id IS NULL THEN RAISE EXCEPTION 'Cell not found'; END IF;
  PERFORM public.card_block_guard(v_card_id);

  -- content_version is maintained but NOT enforced: conflict rejection for
  -- cells arrives in phase 3c.
  UPDATE public.card_table_cells SET
    content_html = CASE WHEN p_patch ? 'content_html' THEN p_patch->>'content_html' ELSE content_html END,
    align_h      = CASE WHEN p_patch ? 'align_h' THEN NULLIF(p_patch->>'align_h', '') ELSE align_h END,
    align_v      = CASE WHEN p_patch ? 'align_v' THEN NULLIF(p_patch->>'align_v', '') ELSE align_v END,
    content_version = CASE WHEN p_patch ? 'content_html' THEN content_version + 1 ELSE content_version END,
    updated_at   = now()
  WHERE id = p_cell_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_card_table_meta(p_card_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.card_block_guard(p_card_id);

  UPDATE public.card_table SET
    caption        = CASE WHEN p_patch ? 'caption' THEN p_patch->>'caption' ELSE caption END,
    caption_suffix = CASE WHEN p_patch ? 'caption_suffix'
                          THEN NULLIF(p_patch->>'caption_suffix', '') ELSE caption_suffix END,
    updated_at     = now()
  WHERE card_id = p_card_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_card_figure(p_card_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_proposal_id uuid := public.card_block_guard(p_card_id);
  v_figure_id uuid;
BEGIN
  IF p_patch ? 'figure_id' THEN
    v_figure_id := NULLIF(p_patch->>'figure_id', '')::uuid;
    IF v_figure_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.figures f WHERE f.id = v_figure_id AND f.proposal_id = v_proposal_id
    ) THEN
      RAISE EXCEPTION 'Figure not found in this proposal';
    END IF;
  END IF;

  UPDATE public.card_figure SET
    figure_id    = CASE WHEN p_patch ? 'figure_id' THEN v_figure_id ELSE figure_id END,
    caption      = CASE WHEN p_patch ? 'caption' THEN p_patch->>'caption' ELSE caption END,
    float        = CASE WHEN p_patch ? 'float' THEN COALESCE(NULLIF(p_patch->>'float', ''), 'none') ELSE float END,
    max_width_cm = CASE WHEN p_patch ? 'max_width_cm'
                        THEN NULLIF(p_patch->>'max_width_cm', '')::numeric ELSE max_width_cm END,
    updated_at   = now()
  WHERE card_id = p_card_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ------------------------------------------------------------------ grants
REVOKE ALL ON FUNCTION public.create_table_card(uuid, integer, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_figure_card(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_card_table_row(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_card_table_row(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_card_table_column(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_card_table_column(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_card_table_column(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_card_table_cell(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_card_table_meta(uuid, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_card_figure(uuid, jsonb) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_table_card(uuid, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_figure_card(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_card_table_row(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_card_table_row(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_card_table_column(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_card_table_column(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_card_table_column(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_card_table_cell(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_card_table_meta(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_card_figure(uuid, jsonb) TO authenticated;
