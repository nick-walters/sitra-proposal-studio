
-- Master predicate map for capture (superset: in-scope + excluded content)
CREATE OR REPLACE FUNCTION public.capture_scope_predicates()
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT jsonb_object_agg(k, v) FROM (VALUES
    -- Restore-in-scope
    ('part_a1',                          'proposal_id = $1'),
    ('participants',                     'proposal_id = $1'),
    ('participant_departments',          'participant_id IN (SELECT id FROM participants WHERE proposal_id = $1)'),
    ('participant_members',              'participant_id IN (SELECT id FROM participants WHERE proposal_id = $1)'),
    ('participant_researchers',          'participant_id IN (SELECT id FROM participants WHERE proposal_id = $1)'),
    ('participant_achievements',         'participant_id IN (SELECT id FROM participants WHERE proposal_id = $1)'),
    ('participant_infrastructure',       'participant_id IN (SELECT id FROM participants WHERE proposal_id = $1)'),
    ('participant_previous_projects',    'participant_id IN (SELECT id FROM participants WHERE proposal_id = $1)'),
    ('participant_dependencies',         'participant_id IN (SELECT id FROM participants WHERE proposal_id = $1)'),
    ('participant_organisation_roles',   'participant_id IN (SELECT id FROM participants WHERE proposal_id = $1)'),
    ('participant_ocd_uploads',          'proposal_id = $1'),
    ('part_a_data',                      'participant_id IN (SELECT id FROM participants WHERE proposal_id = $1)'),
    ('member_wp_allocations',            'member_id IN (SELECT pm.id FROM participant_members pm JOIN participants p ON p.id = pm.participant_id WHERE p.proposal_id = $1)'),
    ('wp_drafts',                        'proposal_id = $1'),
    ('wp_draft_tasks',                   'wp_draft_id IN (SELECT id FROM wp_drafts WHERE proposal_id = $1)'),
    ('wp_draft_deliverables',            'wp_draft_id IN (SELECT id FROM wp_drafts WHERE proposal_id = $1)'),
    ('wp_draft_effort',                  'wp_draft_id IN (SELECT id FROM wp_drafts WHERE proposal_id = $1)'),
    ('wp_draft_task_effort',             'task_id IN (SELECT t.id FROM wp_draft_tasks t JOIN wp_drafts w ON w.id = t.wp_draft_id WHERE w.proposal_id = $1)'),
    ('wp_draft_task_participants',       'task_id IN (SELECT t.id FROM wp_draft_tasks t JOIN wp_drafts w ON w.id = t.wp_draft_id WHERE w.proposal_id = $1)'),
    ('wp_draft_deliverable_tasks',       'wp_draft_task_id IN (SELECT t.id FROM wp_draft_tasks t JOIN wp_drafts w ON w.id = t.wp_draft_id WHERE w.proposal_id = $1)'),
    ('wp_color_palette',                 'proposal_id = $1'),
    ('wp_themes',                        'proposal_id = $1'),
    ('wp_dependencies',                  'proposal_id = $1'),
    ('work_packages',                    'proposal_id = $1'),
    ('proposal_milestones',              'proposal_id = $1'),
    ('proposal_milestone_wps',           'milestone_id IN (SELECT id FROM proposal_milestones WHERE proposal_id = $1)'),
    ('proposal_risks',                   'proposal_id = $1'),
    ('proposal_risk_wps',                'risk_id IN (SELECT id FROM proposal_risks WHERE proposal_id = $1)'),
    ('expertise_matrix_rows',            'proposal_id = $1'),
    ('expertise_matrix_columns',         'proposal_id = $1'),
    ('expertise_matrix_cells',           'row_id IN (SELECT id FROM expertise_matrix_rows WHERE proposal_id = $1)'),
    ('budget_rows',                      'proposal_id = $1'),
    ('budget_items',                     'proposal_id = $1'),
    ('budget_personnel_breakdown',       'budget_row_id IN (SELECT id FROM budget_rows WHERE proposal_id = $1)'),
    ('budget_cost_justification_items',  'budget_row_id IN (SELECT id FROM budget_rows WHERE proposal_id = $1)'),
    ('effort_row_locks',                 'proposal_id = $1'),
    ('case_drafts',                      'proposal_id = $1'),
    ('proposal_case_types',              'proposal_id = $1'),
    ('case_subsection_templates',        'proposal_id = $1'),
    ('b12_ongoing_projects',             'proposal_id = $1'),
    ('b12_ongoing_project_participants', 'ongoing_project_id IN (SELECT id FROM b12_ongoing_projects WHERE proposal_id = $1)'),
    ('section_content',                  'proposal_id = $1'),
    ('section_versions',                 'proposal_id = $1'),
    ('section_tracked_changes',          'proposal_id = $1'),
    ('section_comments',                 'proposal_id = $1'),
    ('section_reviews',                  'proposal_id = $1'),
    ('section_visibility_locks',         'proposal_id = $1'),
    ('section_footnotes',                'section_content_id IN (SELECT id FROM section_content WHERE proposal_id = $1)'),
    ('"references"',                     'proposal_id = $1'),
    ('table_captions',                   'proposal_id = $1'),
    ('table_column_widths',              'proposal_id = $1'),
    ('figures',                          'proposal_id = $1'),
    ('figure_references',                'figure_id IN (SELECT id FROM figures WHERE proposal_id = $1)'),
    ('fstp_content',                     'proposal_id = $1'),
    ('ethics_assessment',                'proposal_id = $1'),
    -- Restore-excluded (captured for reference, never written back)
    ('user_roles',                       'proposal_id = $1'),
    ('user_availability',                'proposal_id = $1'),
    ('proposal_analyses',                'proposal_id = $1'),
    ('proposal_backups',                 'proposal_id = $1'),
    ('notifications',                    'proposal_id = $1'),
    ('proposal_messages',                'proposal_id = $1'),
    ('proposal_message_recipients',      'message_id IN (SELECT id FROM proposal_messages WHERE proposal_id = $1)'),
    ('message_stars',                    'message_id IN (SELECT id FROM proposal_messages WHERE proposal_id = $1)'),
    ('pinned_proposals',                 'proposal_id = $1'),
    ('proposal_user_onboarding',         'proposal_id = $1'),
    ('comments',                         'proposal_id = $1'),
    ('proposal_templates',               'proposal_id = $1'),
    ('proposal_tasks',                   'proposal_id = $1'),
    ('proposal_task_assignees',          'task_id IN (SELECT id FROM proposal_tasks WHERE proposal_id = $1)'),
    ('proposal_progress',                'proposal_id = $1'),
    ('versions',                         'proposal_id = $1')
  ) AS m(k, v);
$$;

-- Restore predicate map now derived from the master (in-scope subset)
CREATE OR REPLACE FUNCTION public.restore_scope_predicates()
RETURNS jsonb LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT jsonb_object_agg(k,
           CASE WHEN k = '"references"' THEN v ELSE v END)
  FROM (
    SELECT (jsonb_each_text(public.capture_scope_predicates())).*
  ) AS e(k, v)
  WHERE k = ANY(public.restore_in_scope_tables())
     OR k = '"references"' AND 'references' = ANY(public.restore_in_scope_tables());
$$;

-- Rewrite capture: iterate the master map (safe for >100 tables)
CREATE OR REPLACE FUNCTION public.create_proposal_snapshot(
  p_proposal_id uuid,
  p_label text DEFAULT NULL,
  p_source text DEFAULT 'manual'
)
RETURNS TABLE(snapshot_id uuid, counts jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_snapshot jsonb := '{}'::jsonb;
  v_counts jsonb;
  v_id uuid;
  v_scope jsonb := public.capture_scope_predicates();
  v_tbl text;
  v_predicate text;
  v_key text;
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: caller cannot edit this proposal';
  END IF;

  -- proposals row
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_rows
    FROM proposals t WHERE t.id = p_proposal_id;
  v_snapshot := v_snapshot || jsonb_build_object('proposals', v_rows);

  -- every other captured table
  FOR v_tbl, v_predicate IN SELECT key, value FROM jsonb_each_text(v_scope) LOOP
    -- key stored with quoting for reserved words (e.g. "references")
    v_key := replace(v_tbl, '"', '');
    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM %s t WHERE %s',
      v_tbl, v_predicate
    ) INTO v_rows USING p_proposal_id;
    v_snapshot := v_snapshot || jsonb_build_object(v_key, v_rows);
  END LOOP;

  SELECT jsonb_object_agg(key, jsonb_array_length(value))
    INTO v_counts FROM jsonb_each(v_snapshot);

  INSERT INTO proposal_snapshots (proposal_id, snapshot, label, source, table_counts, created_by)
  VALUES (p_proposal_id, v_snapshot, p_label, p_source, v_counts, auth.uid())
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_counts;
END;
$fn$;

-- Preview: also iterate the restore predicate map with reserved-word quoting
CREATE OR REPLACE FUNCTION public.preview_proposal_restore(
  p_proposal_id uuid,
  p_snapshot_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_snapshot jsonb;
  v_snap_pid uuid;
  v_scope jsonb := public.capture_scope_predicates();
  v_in_scope text[] := public.restore_in_scope_tables();
  v_excluded text[] := public.restore_excluded_tables();
  v_tbl_quoted text;
  v_tbl_key text;
  v_predicate text;
  v_live jsonb;
  v_snap_rows jsonb;
  v_would_delete int;
  v_would_add int;
  v_would_change int;
  v_unchanged int;
  v_by_table jsonb := '{}'::jsonb;
  v_total_delete int := 0;
  v_total_add int := 0;
  v_total_change int := 0;
  v_total_unchanged int := 0;
  v_live_prop jsonb;
  v_snap_prop jsonb;
  v_prop_change int := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: caller cannot edit this proposal';
  END IF;

  SELECT snapshot, proposal_id INTO v_snapshot, v_snap_pid
    FROM proposal_snapshots WHERE id = p_snapshot_id;
  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Snapshot % not found', p_snapshot_id;
  END IF;
  IF v_snap_pid <> p_proposal_id THEN
    RAISE EXCEPTION 'Snapshot belongs to a different proposal';
  END IF;

  -- proposals row diff (whole row)
  SELECT to_jsonb(p) INTO v_live_prop FROM proposals p WHERE id = p_proposal_id;
  v_snap_prop := (v_snapshot->'proposals'->0);
  IF v_snap_prop IS NOT NULL AND v_live_prop IS DISTINCT FROM v_snap_prop THEN
    v_prop_change := 1;
  END IF;
  v_by_table := v_by_table || jsonb_build_object('proposals', jsonb_build_object(
    'would_delete', 0, 'would_add', 0,
    'would_change', v_prop_change,
    'unchanged', CASE WHEN v_prop_change = 0 THEN 1 ELSE 0 END
  ));
  v_total_change := v_total_change + v_prop_change;
  v_total_unchanged := v_total_unchanged + (CASE WHEN v_prop_change = 0 THEN 1 ELSE 0 END);

  -- iterate in-scope tables using master predicate map
  FOR v_tbl_quoted, v_predicate IN SELECT key, value FROM jsonb_each_text(v_scope) LOOP
    v_tbl_key := replace(v_tbl_quoted, '"', '');
    IF NOT (v_tbl_key = ANY(v_in_scope)) THEN CONTINUE; END IF;

    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM %s t WHERE %s',
      v_tbl_quoted, v_predicate
    ) INTO v_live USING p_proposal_id;

    v_snap_rows := COALESCE(v_snapshot->v_tbl_key, '[]'::jsonb);

    WITH
      snap AS (SELECT (e->>'id')::text AS id, e AS row FROM jsonb_array_elements(v_snap_rows) e),
      live AS (SELECT (e->>'id')::text AS id, e AS row FROM jsonb_array_elements(v_live) e),
      j    AS (SELECT snap.id AS sid, live.id AS lid, snap.row AS srow, live.row AS lrow
               FROM snap FULL OUTER JOIN live ON snap.id = live.id)
    SELECT
      count(*) FILTER (WHERE sid IS NULL)::int,
      count(*) FILTER (WHERE lid IS NULL)::int,
      count(*) FILTER (WHERE sid IS NOT NULL AND lid IS NOT NULL AND srow IS DISTINCT FROM lrow)::int,
      count(*) FILTER (WHERE sid IS NOT NULL AND lid IS NOT NULL AND NOT (srow IS DISTINCT FROM lrow))::int
    INTO v_would_delete, v_would_add, v_would_change, v_unchanged
    FROM j;

    v_by_table := v_by_table || jsonb_build_object(v_tbl_key, jsonb_build_object(
      'would_delete', v_would_delete,
      'would_add', v_would_add,
      'would_change', v_would_change,
      'unchanged', v_unchanged
    ));

    v_total_delete    := v_total_delete    + v_would_delete;
    v_total_add       := v_total_add       + v_would_add;
    v_total_change    := v_total_change    + v_would_change;
    v_total_unchanged := v_total_unchanged + v_unchanged;
  END LOOP;

  RETURN jsonb_build_object(
    'snapshot_id', p_snapshot_id,
    'proposal_id', p_proposal_id,
    'totals', jsonb_build_object(
      'would_delete', v_total_delete,
      'would_add', v_total_add,
      'would_change', v_total_change,
      'unchanged', v_total_unchanged
    ),
    'by_table', v_by_table,
    'excluded_tables', to_jsonb(v_excluded),
    'excluded_note', 'These tables are captured for reference but NEVER written back by restore.',
    'read_only', true
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.capture_scope_predicates() TO authenticated;
