-- ============================================================
-- 1. VERSION HISTORY: extend card_field_versions to a generic target
-- ============================================================

ALTER TABLE public.card_field_versions
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'card_field',
  ADD COLUMN IF NOT EXISTS target_id uuid;

ALTER TABLE public.card_field_versions DISABLE TRIGGER trg_card_field_versions_no_update;
UPDATE public.card_field_versions SET target_id = field_id WHERE target_id IS NULL;
ALTER TABLE public.card_field_versions ENABLE TRIGGER trg_card_field_versions_no_update;

ALTER TABLE public.card_field_versions
  ALTER COLUMN target_id SET NOT NULL,
  ALTER COLUMN field_id DROP NOT NULL;

-- Legacy rows keep their card_fields foreign key (nullable FKs are unchecked
-- when null), so existing history remains exactly as it was.
ALTER TABLE public.card_field_versions
  DROP CONSTRAINT IF EXISTS card_field_versions_text_box_check;

ALTER TABLE public.card_field_versions
  ADD CONSTRAINT card_field_versions_target_shape_check CHECK (
    (target_type = 'card_field'
       AND field_id IS NOT NULL
       AND target_id = field_id
       AND text_box IN ('header', 'content'))
    OR (target_type <> 'card_field'
       AND field_id IS NULL
       AND text_box ~ '^[a-z][a-z0-9_]*$')
  );

ALTER TABLE public.card_field_versions
  ADD CONSTRAINT card_field_versions_target_type_check CHECK (
    target_type IN ('card_field','wp_draft','wp_draft_task','wp_draft_deliverable',
                    'case_draft','case_draft_subsection')
  );

CREATE UNIQUE INDEX IF NOT EXISTS card_field_versions_target_unique
  ON public.card_field_versions (target_type, target_id, text_box, version_number);

CREATE INDEX IF NOT EXISTS card_field_versions_target_idx
  ON public.card_field_versions (target_type, target_id, text_box, version_number DESC);

-- Which table a version target lives in.
CREATE OR REPLACE FUNCTION public.version_target_table(p_target_type text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE p_target_type
    WHEN 'card_field'             THEN 'card_fields'
    WHEN 'wp_draft'               THEN 'wp_drafts'
    WHEN 'wp_draft_task'          THEN 'wp_draft_tasks'
    WHEN 'wp_draft_deliverable'   THEN 'wp_draft_deliverables'
    WHEN 'case_draft'             THEN 'case_drafts'
    WHEN 'case_draft_subsection'  THEN 'case_drafts'
  END;
$$;

CREATE OR REPLACE FUNCTION public.version_target_proposal(p_target_type text, p_target_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_table text := public.version_target_table(p_target_type); v_pid uuid;
BEGIN
  IF v_table IS NULL THEN RAISE EXCEPTION 'Unknown version target type: %', p_target_type; END IF;
  IF v_table = 'card_fields' THEN
    SELECT proposal_id INTO v_pid FROM public.card_fields WHERE id = p_target_id;
  ELSE
    v_pid := public.versioned_row_proposal(v_table, p_target_id);
  END IF;
  RETURN v_pid;
END;
$$;

-- Generic append-a-snapshot. No-ops when the value is unchanged.
CREATE OR REPLACE FUNCTION public.save_target_version(
  p_target_type text, p_target_id uuid, p_text_box text, p_value text,
  p_is_auto_save boolean DEFAULT true)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_pid uuid; v_next integer; v_last record; v_is_header boolean;
BEGIN
  v_pid := public.version_target_proposal(p_target_type, p_target_id);
  IF v_pid IS NULL THEN RAISE EXCEPTION 'Version target not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), v_pid) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
  END IF;

  v_is_header := (p_target_type = 'card_field' AND p_text_box = 'header');

  SELECT content_html, heading, version_number INTO v_last
    FROM public.card_field_versions
   WHERE target_type = p_target_type AND target_id = p_target_id AND text_box = p_text_box
   ORDER BY version_number DESC LIMIT 1;

  IF FOUND AND COALESCE(
       CASE WHEN v_is_header THEN v_last.heading ELSE v_last.content_html END, ''
     ) IS NOT DISTINCT FROM COALESCE(p_value, '') THEN
    RETURN v_last.version_number;
  END IF;

  SELECT COALESCE(max(version_number), 0) + 1 INTO v_next
    FROM public.card_field_versions
   WHERE target_type = p_target_type AND target_id = p_target_id AND text_box = p_text_box;

  INSERT INTO public.card_field_versions (
    field_id, target_type, target_id, proposal_id, version_number, text_box,
    content_html, heading, is_auto_save, created_by
  ) VALUES (
    CASE WHEN p_target_type = 'card_field' THEN p_target_id END,
    p_target_type, p_target_id, v_pid, v_next, p_text_box,
    CASE WHEN v_is_header THEN NULL ELSE p_value END,
    CASE WHEN v_is_header THEN p_value END,
    p_is_auto_save, auth.uid()
  );
  RETURN v_next;
END;
$$;

-- The card entry point is now a thin wrapper, so card behaviour is unchanged.
CREATE OR REPLACE FUNCTION public.save_card_field_version(
  p_field_id uuid, p_text_box text, p_value text, p_is_auto_save boolean DEFAULT true)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_text_box NOT IN ('header','content') THEN
    RAISE EXCEPTION 'Unknown text box: %', p_text_box;
  END IF;
  RETURN public.save_target_version('card_field', p_field_id, p_text_box, p_value, p_is_auto_save);
END;
$$;

-- Restore an older version through the versioned save path so that a
-- concurrent edit is still rejected.
CREATE OR REPLACE FUNCTION public.restore_target_version(
  p_version_id uuid, p_expected_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v public.card_field_versions%ROWTYPE;
  v_table text; v_value text; v_res jsonb; v_key text; v_cur jsonb;
BEGIN
  SELECT * INTO v FROM public.card_field_versions WHERE id = p_version_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Version not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), v.proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
  END IF;

  v_value := CASE WHEN v.target_type = 'card_field' AND v.text_box = 'header'
                  THEN v.heading ELSE v.content_html END;
  v_table := public.version_target_table(v.target_type);

  IF v.target_type = 'card_field' THEN
    UPDATE public.card_fields
       SET heading      = CASE WHEN v.text_box = 'header'  THEN v_value ELSE heading END,
           content_html = CASE WHEN v.text_box = 'content' THEN v_value ELSE content_html END
     WHERE id = v.target_id;
    v_res := jsonb_build_object('ok', true, 'conflict', false);
  ELSIF v.target_type = 'case_draft_subsection' THEN
    SELECT COALESCE(subsection_content, '{}'::jsonb) INTO v_cur
      FROM public.case_drafts WHERE id = v.target_id;
    v_key := v.text_box;
    v_res := public.save_versioned_row(
      'case_drafts', v.target_id,
      jsonb_build_object('subsection_content',
        jsonb_set(v_cur, ARRAY[v_key], to_jsonb(COALESCE(v_value, '')), true)),
      p_expected_version);
  ELSE
    v_res := public.save_versioned_row(
      v_table, v.target_id, jsonb_build_object(v.text_box, v_value), p_expected_version);
  END IF;

  IF COALESCE((v_res->>'conflict')::boolean, false) OR NOT COALESCE((v_res->>'ok')::boolean, false) THEN
    RETURN v_res;
  END IF;

  PERFORM public.save_target_version(v.target_type, v.target_id, v.text_box, v_value, false);
  RETURN v_res;
END;
$$;

-- Thinning now partitions by generic target; rules unchanged.
CREATE OR REPLACE FUNCTION public.thin_card_field_versions(p_proposal_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE deleted_count integer := 0; r record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: caller cannot edit this proposal';
  END IF;

  PERFORM set_config('app.card_bin_ok', '1', true);

  FOR r IN
    WITH latest_per_box AS (
      SELECT DISTINCT ON (target_type, target_id, text_box) id
      FROM card_field_versions
      WHERE proposal_id = p_proposal_id
      ORDER BY target_type, target_id, text_box, version_number DESC
    ),
    candidates AS (
      SELECT cv.id,
        ROW_NUMBER() OVER (
          PARTITION BY cv.target_type, cv.target_id, cv.text_box,
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
    SELECT id FROM candidates WHERE age_bucket = 'thin' AND rn > 1
  LOOP
    DELETE FROM card_field_versions WHERE id = r.id AND proposal_id = p_proposal_id;
    deleted_count := deleted_count + 1;
  END LOOP;

  PERFORM set_config('app.card_bin_ok', '0', true);
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.thin_target_versions(p_proposal_id uuid)
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.thin_card_field_versions(p_proposal_id);
$$;

-- ============================================================
-- 2. RECYCLE BIN: generic parent and a payload snapshot
-- ============================================================

ALTER TABLE public.card_deletions
  ADD COLUMN IF NOT EXISTS parent_type text,
  ADD COLUMN IF NOT EXISTS parent_id uuid,
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS links jsonb;

UPDATE public.card_deletions
   SET parent_type = 'card', parent_id = parent_card_id
 WHERE parent_card_id IS NOT NULL AND parent_id IS NULL;

ALTER TABLE public.card_deletions DROP CONSTRAINT IF EXISTS card_deletions_target_type_check;
ALTER TABLE public.card_deletions
  ADD CONSTRAINT card_deletions_target_type_check CHECK (
    target_type IN ('card','field','wp_draft_task','wp_draft_deliverable','case_subsection')
  );

CREATE INDEX IF NOT EXISTS card_deletions_parent_idx
  ON public.card_deletions (parent_type, parent_id) WHERE restored_at IS NULL;

-- Bin a relational row: snapshot it and its links, then delete it through the
-- existing guarded, resequencing delete.
CREATE OR REPLACE FUNCTION public.bin_target_row(
  p_target_type text, p_target_id uuid, p_expected_version integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_table text; v_pid uuid; v_payload jsonb; v_links jsonb := '{}'::jsonb;
  v_parent_type text; v_parent_id uuid; v_res jsonb;
BEGIN
  v_table := CASE p_target_type
    WHEN 'wp_draft_task'        THEN 'wp_draft_tasks'
    WHEN 'wp_draft_deliverable' THEN 'wp_draft_deliverables'
    WHEN 'case_subsection'      THEN 'case_subsection_templates'
  END;
  IF v_table IS NULL THEN RAISE EXCEPTION 'Unknown bin target type: %', p_target_type; END IF;

  IF p_target_type = 'case_subsection' THEN
    SELECT proposal_id INTO v_pid FROM public.case_subsection_templates WHERE id = p_target_id;
  ELSE
    v_pid := public.versioned_row_proposal(v_table, p_target_id);
  END IF;
  IF v_pid IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), v_pid) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
  END IF;

  EXECUTE format('SELECT to_jsonb(t) FROM %I t WHERE t.id = $1', v_table)
    INTO v_payload USING p_target_id;
  IF v_payload IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  IF p_target_type = 'wp_draft_task' THEN
    v_parent_type := 'wp_draft'; v_parent_id := (v_payload->>'wp_draft_id')::uuid;
    v_links := jsonb_build_object(
      'wp_draft_task_effort', COALESCE((SELECT jsonb_agg(to_jsonb(e)) FROM public.wp_draft_task_effort e WHERE e.task_id = p_target_id), '[]'::jsonb),
      'wp_draft_task_participants', COALESCE((SELECT jsonb_agg(to_jsonb(p)) FROM public.wp_draft_task_participants p WHERE p.task_id = p_target_id), '[]'::jsonb),
      'wp_draft_deliverable_tasks', COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM public.wp_draft_deliverable_tasks d WHERE d.wp_draft_task_id = p_target_id), '[]'::jsonb)
    );
  ELSIF p_target_type = 'wp_draft_deliverable' THEN
    v_parent_type := 'wp_draft'; v_parent_id := (v_payload->>'wp_draft_id')::uuid;
    v_links := jsonb_build_object(
      'wp_draft_deliverable_tasks', COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM public.wp_draft_deliverable_tasks d WHERE d.deliverable_id = p_target_id), '[]'::jsonb)
    );
  ELSE
    v_parent_type := 'proposal'; v_parent_id := v_pid;
    v_links := jsonb_build_object(
      'case_draft_content', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'case_draft_id', c.id,
                 'value', COALESCE(c.subsection_content, '{}'::jsonb) -> (v_payload->>'key')))
          FROM public.case_drafts c
         WHERE c.proposal_id = v_pid
           AND COALESCE(c.subsection_content, '{}'::jsonb) ? (v_payload->>'key')), '[]'::jsonb)
    );
  END IF;

  IF p_target_type = 'case_subsection' THEN
    DELETE FROM public.case_subsection_templates WHERE id = p_target_id;
    UPDATE public.case_drafts
       SET subsection_content = COALESCE(subsection_content, '{}'::jsonb) - (v_payload->>'key')
     WHERE proposal_id = v_pid;
  ELSE
    v_res := public.delete_and_resequence(v_table, p_target_id, p_expected_version);
    IF NOT COALESCE((v_res->>'ok')::boolean, false) THEN RETURN v_res; END IF;
  END IF;

  INSERT INTO public.card_deletions (
    proposal_id, section_id, target_type, target_id, parent_type, parent_id,
    payload, links, deleted_by)
  VALUES (v_pid, NULL, p_target_type, p_target_id, v_parent_type, v_parent_id,
          v_payload, v_links, auth.uid());

  RETURN jsonb_build_object('ok', true, 'conflict', false);
END;
$$;

-- Restore a binned item. Blocks and modules keep their existing paths.
CREATE OR REPLACE FUNCTION public.restore_binned_target(p_deletion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  d public.card_deletions%ROWTYPE; v_link jsonb; v_key text; v_wp uuid;
BEGIN
  SELECT * INTO d FROM public.card_deletions WHERE id = p_deletion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Bin entry not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), d.proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
  END IF;
  IF d.restored_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already_restored', true);
  END IF;

  IF d.target_type = 'card' THEN
    PERFORM public.restore_card(d.target_id);
    RETURN jsonb_build_object('ok', true, 'target_type', 'card');
  ELSIF d.target_type = 'field' THEN
    RETURN public.restore_card_field(d.target_id) || jsonb_build_object('ok', true);
  END IF;

  IF d.payload IS NULL THEN RAISE EXCEPTION 'Bin entry has no snapshot to restore'; END IF;

  IF d.target_type = 'wp_draft_task' THEN
    v_wp := (d.payload->>'wp_draft_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.wp_drafts WHERE id = v_wp) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'parent_missing');
    END IF;
    INSERT INTO public.wp_draft_tasks
      SELECT * FROM jsonb_populate_record(NULL::public.wp_draft_tasks, d.payload);

    FOR v_link IN SELECT * FROM jsonb_array_elements(COALESCE(d.links->'wp_draft_task_effort', '[]'::jsonb)) LOOP
      INSERT INTO public.wp_draft_task_effort
        SELECT * FROM jsonb_populate_record(NULL::public.wp_draft_task_effort, v_link)
        ON CONFLICT DO NOTHING;
    END LOOP;
    FOR v_link IN SELECT * FROM jsonb_array_elements(COALESCE(d.links->'wp_draft_task_participants', '[]'::jsonb)) LOOP
      INSERT INTO public.wp_draft_task_participants
        SELECT * FROM jsonb_populate_record(NULL::public.wp_draft_task_participants, v_link)
        ON CONFLICT DO NOTHING;
    END LOOP;
    FOR v_link IN SELECT * FROM jsonb_array_elements(COALESCE(d.links->'wp_draft_deliverable_tasks', '[]'::jsonb)) LOOP
      IF EXISTS (SELECT 1 FROM public.wp_draft_deliverables WHERE id = (v_link->>'deliverable_id')::uuid) THEN
        INSERT INTO public.wp_draft_deliverable_tasks
          SELECT * FROM jsonb_populate_record(NULL::public.wp_draft_deliverable_tasks, v_link)
          ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    PERFORM public.resequence_numbered('wp_draft_tasks', v_wp);
    -- Deliverable numbering follows task numbering, so refresh it too.
    PERFORM public.resequence_numbered('wp_draft_deliverables', v_wp);

  ELSIF d.target_type = 'wp_draft_deliverable' THEN
    v_wp := (d.payload->>'wp_draft_id')::uuid;
    IF NOT EXISTS (SELECT 1 FROM public.wp_drafts WHERE id = v_wp) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'parent_missing');
    END IF;
    INSERT INTO public.wp_draft_deliverables
      SELECT * FROM jsonb_populate_record(NULL::public.wp_draft_deliverables, d.payload);

    FOR v_link IN SELECT * FROM jsonb_array_elements(COALESCE(d.links->'wp_draft_deliverable_tasks', '[]'::jsonb)) LOOP
      IF EXISTS (SELECT 1 FROM public.wp_draft_tasks WHERE id = (v_link->>'wp_draft_task_id')::uuid) THEN
        INSERT INTO public.wp_draft_deliverable_tasks
          SELECT * FROM jsonb_populate_record(NULL::public.wp_draft_deliverable_tasks, v_link)
          ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;

    -- Links are inserted after the row, so the insert-time statement trigger
    -- has not seen them: renumber again by due month and linked task order.
    PERFORM public.resequence_numbered('wp_draft_deliverables', v_wp);

  ELSIF d.target_type = 'case_subsection' THEN
    v_key := d.payload->>'key';
    INSERT INTO public.case_subsection_templates
      SELECT * FROM jsonb_populate_record(NULL::public.case_subsection_templates, d.payload)
      ON CONFLICT (id) DO NOTHING;
    FOR v_link IN SELECT * FROM jsonb_array_elements(COALESCE(d.links->'case_draft_content', '[]'::jsonb)) LOOP
      UPDATE public.case_drafts
         SET subsection_content = jsonb_set(
               COALESCE(subsection_content, '{}'::jsonb), ARRAY[v_key],
               COALESCE(v_link->'value', '""'::jsonb), true)
       WHERE id = (v_link->>'case_draft_id')::uuid;
    END LOOP;
  ELSE
    RAISE EXCEPTION 'Unknown bin target type: %', d.target_type;
  END IF;

  UPDATE public.card_deletions
     SET restored_at = now(), restored_by = auth.uid()
   WHERE id = p_deletion_id;

  RETURN jsonb_build_object('ok', true, 'target_type', d.target_type);
END;
$$;

-- Card paths record the generic parent alongside the legacy column.
CREATE OR REPLACE FUNCTION public.soft_delete_card(p_card_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_card public.proposal_cards%ROWTYPE;
BEGIN
  IF NOT public.can_edit_proposal(auth.uid(), (SELECT proposal_id FROM public.proposal_cards WHERE id = p_card_id)) THEN
    RAISE EXCEPTION 'You do not have permission to edit this proposal';
  END IF;

  SELECT * INTO v_card FROM public.proposal_cards WHERE id = p_card_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
  IF v_card.deleted_at IS NOT NULL THEN RETURN; END IF;
  IF NOT v_card.is_deletable THEN RAISE EXCEPTION 'This card cannot be deleted'; END IF;

  PERFORM set_config('app.card_bin_ok', '1', true);

  UPDATE public.proposal_cards SET deleted_at = now(), deleted_by = auth.uid() WHERE id = p_card_id;

  UPDATE public.card_fields
     SET deleted_at = now(), deleted_by = auth.uid(), deleted_with_card = true
   WHERE card_id = p_card_id AND deleted_at IS NULL;

  INSERT INTO public.card_deletions (proposal_id, section_id, target_type, target_id, deleted_by)
  VALUES (v_card.proposal_id, v_card.section_id, 'card', p_card_id, auth.uid());

  INSERT INTO public.card_deletions (proposal_id, section_id, target_type, target_id,
                                     parent_card_id, parent_type, parent_id, deleted_by)
  SELECT v_card.proposal_id, v_card.section_id, 'field', f.id, p_card_id, 'card', p_card_id, auth.uid()
    FROM public.card_fields f
   WHERE f.card_id = p_card_id AND f.deleted_with_card = true AND f.deleted_at IS NOT NULL;

  PERFORM public.resequence_section_cards(v_card.section_id);
  PERFORM set_config('app.card_bin_ok', '0', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.soft_delete_card_field(p_field_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_field public.card_fields%ROWTYPE; v_section uuid;
BEGIN
  IF NOT public.can_edit_proposal(auth.uid(), (SELECT proposal_id FROM public.card_fields WHERE id = p_field_id)) THEN
    RAISE EXCEPTION 'You do not have permission to edit this proposal';
  END IF;

  SELECT * INTO v_field FROM public.card_fields WHERE id = p_field_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Field not found'; END IF;
  IF v_field.deleted_at IS NOT NULL THEN RETURN; END IF;

  SELECT section_id INTO v_section FROM public.proposal_cards WHERE id = v_field.card_id;

  PERFORM set_config('app.card_bin_ok', '1', true);
  UPDATE public.card_fields
     SET deleted_at = now(), deleted_by = auth.uid(), deleted_with_card = false
   WHERE id = p_field_id;
  INSERT INTO public.card_deletions (proposal_id, section_id, target_type, target_id,
                                     parent_card_id, parent_type, parent_id, deleted_by)
  VALUES (v_field.proposal_id, v_section, 'field', p_field_id, v_field.card_id, 'card', v_field.card_id, auth.uid());
  PERFORM public.resequence_card_fields(v_field.card_id);
  PERFORM set_config('app.card_bin_ok', '0', true);
END;
$$;

-- Purge: generic entries reference already hard-deleted rows, so only their
-- bin record (and any version history for the target) needs clearing.
CREATE OR REPLACE FUNCTION public.purge_deleted_cards()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_field_ids uuid[]; v_card_ids uuid[]; v_generic uuid[]; v_count integer := 0;
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.is_global_admin(auth.uid())) THEN
    RAISE EXCEPTION 'The cards board is restricted to platform owners during beta';
  END IF;

  SELECT array_agg(target_id) INTO v_field_ids FROM public.card_deletions
   WHERE target_type = 'field' AND restored_at IS NULL AND purge_after IS NOT NULL AND purge_after < now();
  SELECT array_agg(target_id) INTO v_card_ids FROM public.card_deletions
   WHERE target_type = 'card' AND restored_at IS NULL AND purge_after IS NOT NULL AND purge_after < now();
  SELECT array_agg(target_id) INTO v_generic FROM public.card_deletions
   WHERE target_type NOT IN ('card','field') AND restored_at IS NULL
     AND purge_after IS NOT NULL AND purge_after < now();

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
  IF v_generic IS NOT NULL THEN
    DELETE FROM public.card_field_versions
     WHERE target_type <> 'card_field' AND target_id = ANY(v_generic);
  END IF;

  WITH d AS (
    DELETE FROM public.card_deletions
     WHERE restored_at IS NULL AND purge_after IS NOT NULL AND purge_after < now()
    RETURNING 1
  ) SELECT count(*) INTO v_count FROM d;

  WITH f AS (
    DELETE FROM public.figures fg
     WHERE fg.deleted_at IS NOT NULL
       AND fg.purge_after IS NOT NULL
       AND fg.purge_after < now()
       AND NOT EXISTS (SELECT 1 FROM public.card_figure cf WHERE cf.figure_id = fg.id)
    RETURNING 1
  ) SELECT v_count + count(*) INTO v_count FROM f;

  PERFORM set_config('app.card_bin_ok', '0', true);
  RETURN v_count;
END;
$$;

-- Grants: authenticated callers only, never anon.
REVOKE ALL ON FUNCTION public.version_target_table(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.version_target_proposal(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_target_version(text, uuid, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_target_version(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.thin_target_versions(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bin_target_row(text, uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_binned_target(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.version_target_table(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.version_target_proposal(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_target_version(text, uuid, text, text, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_target_version(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.thin_target_versions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bin_target_row(text, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_binned_target(uuid) TO authenticated, service_role;