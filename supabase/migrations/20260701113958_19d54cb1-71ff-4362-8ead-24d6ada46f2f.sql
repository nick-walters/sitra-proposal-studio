
CREATE OR REPLACE FUNCTION public.restore_in_scope_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'part_a1',
    'participants','participant_departments','participant_members','participant_researchers',
    'participant_achievements','participant_infrastructure','participant_previous_projects',
    'participant_dependencies','participant_organisation_roles','participant_ocd_uploads',
    'part_a_data','member_wp_allocations',
    'wp_drafts','wp_draft_tasks','wp_draft_deliverables','wp_draft_effort',
    'wp_draft_task_effort','wp_draft_task_participants','wp_draft_deliverable_tasks',
    'wp_color_palette','wp_themes','wp_dependencies','work_packages',
    'proposal_milestones','proposal_milestone_wps','proposal_risks','proposal_risk_wps',
    'expertise_matrix_rows','expertise_matrix_columns','expertise_matrix_cells',
    'budget_rows','budget_items','budget_personnel_breakdown','budget_cost_justification_items',
    'effort_row_locks',
    'case_drafts','proposal_case_types','case_subsection_templates',
    'b12_ongoing_projects','b12_ongoing_project_participants',
    'section_content','section_versions','section_tracked_changes','section_comments',
    'section_reviews','section_visibility_locks','section_footnotes',
    'references','table_captions','table_column_widths',
    'figures','figure_references',
    'fstp_content','ethics_assessment'
  ];
$$;

CREATE OR REPLACE FUNCTION public.restore_excluded_tables()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'user_roles','user_availability',
    'proposal_analyses','evaluation_cost_log',
    'proposal_backups','proposal_snapshots',
    'notifications',
    'proposal_messages','proposal_message_recipients','message_stars',
    'pinned_proposals','proposal_user_onboarding',
    'comments',
    'proposal_templates','proposal_tasks','proposal_task_assignees',
    'proposal_progress','versions'
  ];
$$;

CREATE OR REPLACE FUNCTION public.restore_scope_predicates()
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_object_agg(k, v) FROM (VALUES
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
    ('references',                       'proposal_id = $1'),
    ('table_captions',                   'proposal_id = $1'),
    ('table_column_widths',              'proposal_id = $1'),
    ('figures',                          'proposal_id = $1'),
    ('figure_references',                'figure_id IN (SELECT id FROM figures WHERE proposal_id = $1)'),
    ('fstp_content',                     'proposal_id = $1'),
    ('ethics_assessment',                'proposal_id = $1')
  ) AS m(k, v);
$$;

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
  v_scope jsonb := public.restore_scope_predicates();
  v_in_scope text[] := public.restore_in_scope_tables();
  v_excluded text[] := public.restore_excluded_tables();
  v_tbl text;
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

  -- proposals row (whole-row diff, informational)
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

  FOREACH v_tbl IN ARRAY v_in_scope LOOP
    v_predicate := v_scope->>v_tbl;
    IF v_predicate IS NULL THEN CONTINUE; END IF;

    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM %I t WHERE %s',
      v_tbl, v_predicate
    ) INTO v_live USING p_proposal_id;

    v_snap_rows := COALESCE(v_snapshot->v_tbl, '[]'::jsonb);

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

    v_by_table := v_by_table || jsonb_build_object(v_tbl, jsonb_build_object(
      'would_delete', v_would_delete,
      'would_add', v_would_add,
      'would_change', v_would_change,
      'unchanged', v_unchanged
    ));

    v_total_delete   := v_total_delete    + v_would_delete;
    v_total_add      := v_total_add       + v_would_add;
    v_total_change   := v_total_change    + v_would_change;
    v_total_unchanged:= v_total_unchanged + v_unchanged;
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

REVOKE ALL ON FUNCTION public.preview_proposal_restore(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_proposal_restore(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_in_scope_tables()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_excluded_tables()   TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_scope_predicates()  TO authenticated;
