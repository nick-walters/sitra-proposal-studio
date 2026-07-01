
-- A. Scope changes: drop version-history from capture + restore, keep section_content.

CREATE OR REPLACE FUNCTION public.capture_scope_predicates()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  -- NOTE: section_versions and section_tracked_changes are intentionally excluded.
  -- Version history is an independently protected append-only ledger (see
  -- prevent_section_version_delete); structured snapshots capture LIVE state only.
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
$function$;

CREATE OR REPLACE FUNCTION public.restore_in_scope_tables()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- NOTE: section_versions and section_tracked_changes deliberately excluded.
  -- Version history is an append-only ledger protected by
  -- prevent_section_version_delete; it cannot regress and must not be rewritten.
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
    'section_content','section_comments',
    'section_reviews','section_visibility_locks','section_footnotes',
    'references','table_captions','table_column_widths',
    'figures','figure_references',
    'fstp_content','ethics_assessment'
  ];
$function$;

-- B. One-pass snapshot builder: stage per-table results in a temp table, then
--    materialise the payload via a single jsonb_object_agg. Avoids the
--    v_snapshot := v_snapshot || jsonb_build_object(...) quadratic copy.

CREATE OR REPLACE FUNCTION public.create_proposal_snapshot(p_proposal_id uuid, p_label text DEFAULT NULL::text, p_source text DEFAULT 'manual'::text)
 RETURNS TABLE(snapshot_id uuid, counts jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snapshot jsonb;
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

  CREATE TEMP TABLE IF NOT EXISTS _snapshot_parts(k text PRIMARY KEY, v jsonb) ON COMMIT DROP;
  TRUNCATE _snapshot_parts;

  -- proposals row
  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) INTO v_rows
    FROM proposals t WHERE t.id = p_proposal_id;
  INSERT INTO _snapshot_parts(k, v) VALUES ('proposals', v_rows);

  -- every other captured table (stage into temp, no O(N^2) jsonb concat)
  FOR v_tbl, v_predicate IN SELECT key, value FROM jsonb_each_text(v_scope) LOOP
    v_key := replace(v_tbl, '"', '');
    EXECUTE format(
      'SELECT COALESCE(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM %s t WHERE %s',
      v_tbl, v_predicate
    ) INTO v_rows USING p_proposal_id;
    INSERT INTO _snapshot_parts(k, v) VALUES (v_key, v_rows);
  END LOOP;

  -- Single-pass assembly
  SELECT jsonb_object_agg(k, v) INTO v_snapshot FROM _snapshot_parts;
  SELECT jsonb_object_agg(k, jsonb_array_length(v)) INTO v_counts FROM _snapshot_parts;

  INSERT INTO proposal_snapshots (proposal_id, snapshot, label, source, table_counts, created_by)
  VALUES (p_proposal_id, v_snapshot, p_label, p_source, v_counts, auth.uid())
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_counts;
END;
$function$;
