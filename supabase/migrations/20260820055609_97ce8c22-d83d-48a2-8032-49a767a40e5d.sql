-- 1. Version columns -------------------------------------------------------
ALTER TABLE public.wp_drafts               ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.wp_draft_tasks          ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.wp_draft_deliverables   ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.proposal_milestones     ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.proposal_risks          ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.case_drafts             ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- 2. Version bump trigger ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_row_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Snapshot restore inserts rows verbatim; older snapshots have no version.
    NEW.version := COALESCE(NEW.version, 1);
  ELSE
    NEW.version := COALESCE(OLD.version, 0) + 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bump_version_wp_drafts ON public.wp_drafts;
CREATE TRIGGER bump_version_wp_drafts BEFORE INSERT OR UPDATE ON public.wp_drafts
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
DROP TRIGGER IF EXISTS bump_version_wp_draft_tasks ON public.wp_draft_tasks;
CREATE TRIGGER bump_version_wp_draft_tasks BEFORE INSERT OR UPDATE ON public.wp_draft_tasks
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
DROP TRIGGER IF EXISTS bump_version_wp_draft_deliverables ON public.wp_draft_deliverables;
CREATE TRIGGER bump_version_wp_draft_deliverables BEFORE INSERT OR UPDATE ON public.wp_draft_deliverables
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
DROP TRIGGER IF EXISTS bump_version_proposal_milestones ON public.proposal_milestones;
CREATE TRIGGER bump_version_proposal_milestones BEFORE INSERT OR UPDATE ON public.proposal_milestones
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
DROP TRIGGER IF EXISTS bump_version_proposal_risks ON public.proposal_risks;
CREATE TRIGGER bump_version_proposal_risks BEFORE INSERT OR UPDATE ON public.proposal_risks
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
DROP TRIGGER IF EXISTS bump_version_case_drafts ON public.case_drafts;
CREATE TRIGGER bump_version_case_drafts BEFORE INSERT OR UPDATE ON public.case_drafts
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

-- 3. Helpers ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.versioned_table_allowed(p_table text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_table IN ('wp_drafts','wp_draft_tasks','wp_draft_deliverables',
                     'proposal_milestones','proposal_risks','case_drafts');
$$;

CREATE OR REPLACE FUNCTION public.versioned_row_proposal(p_table text, p_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_pid uuid;
BEGIN
  IF NOT public.versioned_table_allowed(p_table) THEN
    RAISE EXCEPTION 'Table % is not version-guarded', p_table;
  END IF;
  IF p_table IN ('wp_draft_tasks','wp_draft_deliverables') THEN
    EXECUTE format(
      'SELECT w.proposal_id FROM %I c JOIN wp_drafts w ON w.id = c.wp_draft_id WHERE c.id = $1',
      p_table) INTO v_pid USING p_id;
  ELSE
    EXECUTE format('SELECT proposal_id FROM %I WHERE id = $1', p_table) INTO v_pid USING p_id;
  END IF;
  RETURN v_pid;
END;
$$;

-- 4. Guarded single-row save ------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_versioned_row(
  p_table text,
  p_id uuid,
  p_patch jsonb,
  p_expected_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid uuid;
  v_cur integer;
  v_row jsonb;
  v_cols text;
  v_bad text;
  v_new_version integer;
BEGIN
  IF NOT public.versioned_table_allowed(p_table) THEN
    RAISE EXCEPTION 'Table % is not version-guarded', p_table;
  END IF;

  v_pid := public.versioned_row_proposal(p_table, p_id);
  IF v_pid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'conflict', false, 'error', 'not_found');
  END IF;
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), v_pid) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  EXECUTE format('SELECT version, to_jsonb(t) FROM %I t WHERE t.id = $1', p_table)
    INTO v_cur, v_row USING p_id;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_cur THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'version', v_cur, 'row', v_row);
  END IF;

  p_patch := COALESCE(p_patch, '{}'::jsonb) - 'id' - 'version' - 'created_at' - 'proposal_id';
  IF p_patch = '{}'::jsonb THEN
    RETURN jsonb_build_object('ok', true, 'conflict', false, 'version', v_cur, 'row', v_row);
  END IF;

  SELECT string_agg(k, ', ') INTO v_bad
  FROM jsonb_object_keys(p_patch) k
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema = 'public' AND c.table_name = p_table AND c.column_name = k
  );
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'Unknown column(s) % for table %', v_bad, p_table;
  END IF;

  SELECT string_agg(format('%I = r.%I', k, k), ', ') INTO v_cols
  FROM jsonb_object_keys(p_patch) k;

  EXECUTE format(
    'UPDATE %I t SET %s FROM (SELECT * FROM jsonb_populate_record(NULL::%I, $2)) r
       WHERE t.id = $1 RETURNING t.version, to_jsonb(t)',
    p_table, v_cols, p_table)
  INTO v_new_version, v_row USING p_id, p_patch;

  RETURN jsonb_build_object('ok', true, 'conflict', false, 'version', v_new_version, 'row', v_row);
END;
$$;

-- 5. Named wrappers, one per table (mirrors save_card_text) ------------------
CREATE OR REPLACE FUNCTION public.save_wp_draft(p_id uuid, p_patch jsonb, p_expected_version integer)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.save_versioned_row('wp_drafts', p_id, p_patch, p_expected_version);
$$;
CREATE OR REPLACE FUNCTION public.save_wp_draft_task(p_id uuid, p_patch jsonb, p_expected_version integer)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.save_versioned_row('wp_draft_tasks', p_id, p_patch, p_expected_version);
$$;
CREATE OR REPLACE FUNCTION public.save_wp_draft_deliverable(p_id uuid, p_patch jsonb, p_expected_version integer)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.save_versioned_row('wp_draft_deliverables', p_id, p_patch, p_expected_version);
$$;
CREATE OR REPLACE FUNCTION public.save_proposal_milestone(p_id uuid, p_patch jsonb, p_expected_version integer)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.save_versioned_row('proposal_milestones', p_id, p_patch, p_expected_version);
$$;
CREATE OR REPLACE FUNCTION public.save_proposal_risk(p_id uuid, p_patch jsonb, p_expected_version integer)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.save_versioned_row('proposal_risks', p_id, p_patch, p_expected_version);
$$;
CREATE OR REPLACE FUNCTION public.save_case_draft(p_id uuid, p_patch jsonb, p_expected_version integer)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.save_versioned_row('case_drafts', p_id, p_patch, p_expected_version);
$$;

-- 6. All-or-nothing reorder --------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_versioned_rows(p_table text, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_id uuid;
  v_cur integer;
  v_pid uuid;
  v_stale jsonb := '[]'::jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_row jsonb;
  v_idx integer := 0;
BEGIN
  IF NOT public.versioned_table_allowed(p_table) THEN
    RAISE EXCEPTION 'Table % is not version-guarded', p_table;
  END IF;

  -- Authorise + verify every row first; nothing is written until all pass.
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_id := (v_item ->> 'id')::uuid;
    v_pid := public.versioned_row_proposal(p_table, v_id);
    IF v_pid IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'conflict', true, 'error', 'not_found', 'stale', jsonb_build_array(v_id));
    END IF;
    IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), v_pid) THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
    EXECUTE format('SELECT version FROM %I WHERE id = $1', p_table) INTO v_cur USING v_id;
    IF (v_item ? 'expected_version') AND (v_item ->> 'expected_version') IS NOT NULL
       AND (v_item ->> 'expected_version')::int <> v_cur THEN
      v_stale := v_stale || jsonb_build_array(v_id);
    END IF;
  END LOOP;

  IF jsonb_array_length(v_stale) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'stale', v_stale);
  END IF;

  -- Phase 1: park numbers out of the way so unique constraints cannot collide.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_idx := v_idx + 1;
    EXECUTE format('UPDATE %I SET number = $2 WHERE id = $1', p_table)
      USING (v_item ->> 'id')::uuid, -(1000000 + v_idx);
  END LOOP;

  -- Phase 2: apply the requested numbering and order.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    EXECUTE format('UPDATE %I SET number = $2, order_index = $3 WHERE id = $1 RETURNING to_jsonb(%I.*)', p_table, p_table)
      INTO v_row
      USING (v_item ->> 'id')::uuid, (v_item ->> 'number')::int, (v_item ->> 'order_index')::int;
    v_rows := v_rows || jsonb_build_array(v_row);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'conflict', false, 'rows', v_rows);
END;
$$;

-- 7. Per-subsection guarded save for case drafts -----------------------------
CREATE OR REPLACE FUNCTION public.save_case_draft_subsection(
  p_id uuid,
  p_key text,
  p_body text,
  p_heading text,
  p_expected_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid uuid;
  v_content jsonb;
  v_entry jsonb;
  v_current_body text;
  v_heading text;
  v_new_version integer;
BEGIN
  v_pid := public.versioned_row_proposal('case_drafts', p_id);
  IF v_pid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'conflict', false, 'error', 'not_found');
  END IF;
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), v_pid) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT COALESCE(subsection_content, '{}'::jsonb) INTO v_content
    FROM case_drafts WHERE id = p_id FOR UPDATE;

  v_entry := v_content -> p_key;
  v_current_body := CASE
    WHEN v_entry IS NULL THEN ''
    WHEN jsonb_typeof(v_entry) = 'string' THEN v_entry #>> '{}'
    ELSE COALESCE(v_entry ->> 'body', '')
  END;

  IF p_expected_body IS NOT NULL AND COALESCE(v_current_body, '') <> p_expected_body THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'value', v_current_body,
                              'subsection_content', v_content);
  END IF;

  v_heading := COALESCE(
    NULLIF(p_heading, ''),
    CASE WHEN v_entry IS NOT NULL AND jsonb_typeof(v_entry) = 'object'
         THEN v_entry ->> 'heading' END,
    '');

  UPDATE case_drafts
     SET subsection_content = COALESCE(subsection_content, '{}'::jsonb)
         || jsonb_build_object(p_key, jsonb_build_object('heading', v_heading, 'body', COALESCE(p_body, '')))
   WHERE id = p_id
  RETURNING version, subsection_content INTO v_new_version, v_content;

  RETURN jsonb_build_object('ok', true, 'conflict', false, 'version', v_new_version,
                            'subsection_content', v_content);
END;
$$;

-- 8. Grants ------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.save_versioned_row(text, uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_versioned_row(text, uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.versioned_row_proposal(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_wp_draft(uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_wp_draft_task(uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_wp_draft_deliverable(uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_proposal_milestone(uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_proposal_risk(uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_case_draft(uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_versioned_rows(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_case_draft_subsection(uuid, text, text, text, text) TO authenticated, service_role;