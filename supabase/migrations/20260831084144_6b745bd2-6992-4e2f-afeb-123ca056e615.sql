-- 1. Rewrite snapshot machinery without the dead tables
CREATE OR REPLACE FUNCTION public.restore_in_scope_tables_base()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT ARRAY[
    'part_a1',
    'participants','participant_departments','participant_members','participant_researchers',
    'participant_achievements','participant_infrastructure','participant_previous_projects',
    'participant_dependencies','participant_organisation_roles','participant_ocd_uploads',
    'participant_descriptions',
    'part_a_data',
    'wp_drafts','wp_draft_tasks','wp_draft_deliverables','wp_draft_effort',
    'wp_draft_task_effort','wp_draft_task_participants','wp_draft_deliverable_tasks',
    'wp_color_palette','wp_themes','wp_dependencies',
    'proposal_milestones','proposal_milestone_wps','proposal_risks','proposal_risk_wps',
    'expertise_matrix_rows','expertise_matrix_columns','expertise_matrix_cells',
    'budget_rows','budget_items','budget_personnel_breakdown','budget_cost_justification_items',
    'effort_row_locks',
    'case_drafts','proposal_case_types','case_subsection_templates',
    'b12_ongoing_projects','b12_ongoing_project_participants',
    'proposal_cards','card_fields','card_figure','citation_instances',
    'methodology_subsections','methodology_items','methodology_linked_activities',
    'impact_canvas_columns','impact_canvas_rows','impact_canvas_elements',
    'section_content','section_comments',
    'section_reviews','section_visibility_locks',
    'proposal_references','table_captions','table_column_widths',
    'figures',
    'fstp_content','ethics_assessment'
  ];
$function$;

CREATE OR REPLACE FUNCTION public.capture_scope_predicates_base()
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  -- NOTE: section_versions, section_tracked_changes and card_field_versions are
  -- intentionally excluded. Version history is an independently protected
  -- append-only ledger; structured snapshots capture LIVE state only.
  -- Transient state (card_target_locks, card_collapse_states, ui_collapse_states)
  -- and shared template data (template_versions, card_templates, card_guidelines
  -- and their join tables) are not proposal content and are never captured.
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
    ('participant_descriptions',         'proposal_id = $1'),
    ('part_a_data',                      'participant_id IN (SELECT id FROM participants WHERE proposal_id = $1)'),
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
    ('proposal_cards',                   'proposal_id = $1'),
    ('card_fields',                      'proposal_id = $1'),
    ('card_figure',                      'proposal_id = $1'),
    ('citation_instances',               'proposal_id = $1'),
    ('methodology_subsections',          'proposal_id = $1'),
    ('methodology_items',                'proposal_id = $1'),
    ('methodology_linked_activities',    'proposal_id = $1'),
    ('impact_canvas_columns',            'proposal_id = $1'),
    ('impact_canvas_rows',               'proposal_id = $1'),
    ('impact_canvas_elements',           'proposal_id = $1'),
    ('section_content',                  'proposal_id = $1'),
    ('section_comments',                 'proposal_id = $1'),
    ('section_reviews',                  'proposal_id = $1'),
    ('section_visibility_locks',         'proposal_id = $1'),
    ('proposal_references',              'proposal_id = $1'),
    ('table_captions',                   'proposal_id = $1'),
    ('table_column_widths',              'proposal_id = $1'),
    ('figures',                          'proposal_id = $1'),
    ('fstp_content',                     'proposal_id = $1'),
    ('ethics_assessment',                'proposal_id = $1'),
    -- Restore-excluded (captured for reference, never written back)
    ('card_deletions',                   'proposal_id = $1'),
    ('proposal_section_guidelines',      'proposal_section_id IN (SELECT s.id FROM proposal_template_sections s JOIN proposal_templates t ON t.id = s.proposal_template_id WHERE t.proposal_id = $1)'),
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
    ('proposal_templates',               'proposal_id = $1'),
    ('proposal_tasks',                   'proposal_id = $1'),
    ('proposal_task_assignees',          'task_id IN (SELECT id FROM proposal_tasks WHERE proposal_id = $1)'),
    ('proposal_progress',                'proposal_id = $1')
  ) AS m(k, v);
$function$;

-- restore_proposal_snapshot: same body, delete order without the dropped tables
CREATE OR REPLACE FUNCTION public.restore_proposal_snapshot(p_proposal_id uuid, p_snapshot_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_snapshot jsonb;
  v_snap_pid uuid;
  v_scope jsonb := public.capture_scope_predicates();
  v_in_scope text[] := public.restore_in_scope_tables();
  v_excluded text[] := public.restore_excluded_tables();
  v_pre_id uuid;
  v_pre_counts jsonb;
  v_tbl text;
  v_predicate text;
  v_rows jsonb;
  v_inserted_counts jsonb := '{}'::jsonb;
  v_deleted_counts jsonb := '{}'::jsonb;
  v_del int;
  v_ins int;
  v_binned int := 0;
  v_setlist text;
  v_snap_prop jsonb;
  v_delete_order text[] := ARRAY[
    'wp_draft_deliverable_tasks','wp_draft_task_participants',
    'wp_draft_task_effort','wp_draft_deliverables','wp_draft_tasks','wp_draft_effort',
    'wp_dependencies','proposal_milestone_wps','proposal_risk_wps','proposal_milestones',
    'proposal_risks','wp_drafts','wp_themes','wp_color_palette',
    'expertise_matrix_cells','expertise_matrix_columns','expertise_matrix_rows',
    'budget_personnel_breakdown','budget_cost_justification_items','budget_items','budget_rows',
    'effort_row_locks','b12_ongoing_project_participants','b12_ongoing_projects',
    'citation_instances','card_figure','card_fields','proposal_cards','proposal_references',
    'case_drafts','methodology_linked_activities','methodology_items','methodology_subsections',
    'proposal_case_types','case_subsection_templates',
    'impact_canvas_elements','impact_canvas_rows','impact_canvas_columns',
    'figures','section_content',
    'section_comments','section_reviews','section_visibility_locks',
    'table_captions','table_column_widths','fstp_content','ethics_assessment',
    'part_a_data','participant_ocd_uploads','participant_descriptions',
    'participant_organisation_roles',
    'participant_previous_projects','participant_infrastructure','participant_achievements',
    'participant_researchers','participant_departments','participant_dependencies',
    'participant_members','participants','part_a1'
  ];
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_proposal_admin(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: only coordinators and above can restore a snapshot';
  END IF;

  SELECT snapshot, proposal_id INTO v_snapshot, v_snap_pid
    FROM proposal_snapshots WHERE id = p_snapshot_id;
  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Snapshot % not found', p_snapshot_id;
  END IF;
  IF v_snap_pid <> p_proposal_id THEN
    RAISE EXCEPTION 'Snapshot belongs to a different proposal (%): refusing cross-proposal restore', v_snap_pid;
  END IF;

  SELECT snapshot_id, counts INTO v_pre_id, v_pre_counts
    FROM public.create_proposal_snapshot(p_proposal_id, 'pre-restore auto', 'pre-restore');
  IF v_pre_id IS NULL THEN
    RAISE EXCEPTION 'Aborting restore: pre-restore snapshot failed';
  END IF;

  IF cardinality(v_in_scope) <> cardinality(v_delete_order) THEN
    RAISE EXCEPTION 'restore_in_scope_tables (%) and internal delete order (%) are out of sync',
      cardinality(v_in_scope), cardinality(v_delete_order);
  END IF;

  -- DELETE PHASE (children -> parents)
  FOREACH v_tbl IN ARRAY v_delete_order LOOP
    v_predicate := v_scope ->> v_tbl;
    IF v_predicate IS NULL THEN
      RAISE EXCEPTION 'No scope predicate for table %', v_tbl;
    END IF;

    IF v_tbl = 'card_fields' THEN
      DELETE FROM card_fields cf
       WHERE cf.proposal_id = p_proposal_id
         AND NOT EXISTS (SELECT 1 FROM card_field_versions v WHERE v.field_id = cf.id);
      GET DIAGNOSTICS v_del = ROW_COUNT;
    ELSE
      EXECUTE format('DELETE FROM %I WHERE %s', v_tbl, v_predicate) USING p_proposal_id;
      GET DIAGNOSTICS v_del = ROW_COUNT;
    END IF;
    v_deleted_counts := v_deleted_counts || jsonb_build_object(v_tbl, v_del);
  END LOOP;

  -- INSERT PHASE (parents -> children) : reverse of delete order
  FOR i IN REVERSE array_length(v_delete_order, 1) .. 1 LOOP
    v_tbl := v_delete_order[i];
    v_rows := COALESCE(v_snapshot -> v_tbl, '[]'::jsonb);

    IF v_tbl = 'card_fields' THEN
      SELECT string_agg(format('%I = EXCLUDED.%I', column_name, column_name), ', ')
        INTO v_setlist
        FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'card_fields' AND column_name <> 'id';

      IF jsonb_array_length(v_rows) > 0 THEN
        EXECUTE format(
          'INSERT INTO card_fields SELECT * FROM jsonb_populate_recordset(NULL::card_fields, $1)
             ON CONFLICT (id) DO UPDATE SET %s', v_setlist
        ) USING v_rows;
        GET DIAGNOSTICS v_ins = ROW_COUNT;
      ELSE
        v_ins := 0;
      END IF;

      UPDATE card_fields cf
         SET deleted_at = now()
       WHERE cf.proposal_id = p_proposal_id
         AND cf.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM jsonb_array_elements(v_rows) e
            WHERE (e ->> 'id')::uuid = cf.id
         );
      GET DIAGNOSTICS v_binned = ROW_COUNT;

      v_inserted_counts := v_inserted_counts || jsonb_build_object(v_tbl, v_ins);
      CONTINUE;
    END IF;

    IF v_tbl = 'expertise_matrix_columns' THEN
      DELETE FROM expertise_matrix_columns WHERE proposal_id = p_proposal_id;
    END IF;

    IF jsonb_array_length(v_rows) = 0 THEN
      v_inserted_counts := v_inserted_counts || jsonb_build_object(v_tbl, 0);
      CONTINUE;
    END IF;

    IF v_tbl = 'section_comments' THEN
      EXECUTE format($ins$
        INSERT INTO %I SELECT * FROM jsonb_populate_recordset(
          NULL::%I,
          (SELECT jsonb_agg(e - 'parent_comment_id') FROM jsonb_array_elements($1) e)
        )
      $ins$, v_tbl, v_tbl) USING v_rows;

      EXECUTE format($upd$
        UPDATE %I t
        SET parent_comment_id = (e.elem ->> 'parent_comment_id')::uuid
        FROM (SELECT jsonb_array_elements($1) AS elem) e
        WHERE t.id = (e.elem ->> 'id')::uuid
          AND (e.elem ->> 'parent_comment_id') IS NOT NULL
      $upd$, v_tbl) USING v_rows;
      v_ins := jsonb_array_length(v_rows);
    ELSE
      EXECUTE format(
        'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(NULL::%I, $1)',
        v_tbl, v_tbl
      ) USING v_rows;
      GET DIAGNOSTICS v_ins = ROW_COUNT;
    END IF;

    v_inserted_counts := v_inserted_counts || jsonb_build_object(v_tbl, v_ins);
  END LOOP;

  v_snap_prop := v_snapshot -> 'proposals' -> 0;
  IF v_snap_prop IS NOT NULL THEN
    UPDATE proposals SET
      acronym = v_snap_prop ->> 'acronym',
      title = v_snap_prop ->> 'title',
      type = (v_snap_prop ->> 'type')::proposal_type,
      status = COALESCE((v_snap_prop ->> 'status')::proposal_status, status),
      budget_type = (v_snap_prop ->> 'budget_type')::budget_type,
      topic_url = v_snap_prop ->> 'topic_url',
      topic_id = v_snap_prop ->> 'topic_id',
      total_budget = NULLIF(v_snap_prop ->> 'total_budget','')::numeric,
      deadline = NULLIF(v_snap_prop ->> 'deadline','')::timestamptz,
      description = v_snap_prop ->> 'description',
      work_programme = v_snap_prop ->> 'work_programme',
      destination = v_snap_prop ->> 'destination',
      logo_url = v_snap_prop ->> 'logo_url',
      submitted_at = NULLIF(v_snap_prop ->> 'submitted_at','')::timestamptz,
      decision_date = NULLIF(v_snap_prop ->> 'decision_date','')::timestamptz,
      template_type_id = NULLIF(v_snap_prop ->> 'template_type_id','')::uuid,
      budget_template_id = NULLIF(v_snap_prop ->> 'budget_template_id','')::uuid,
      submission_stage = v_snap_prop ->> 'submission_stage',
      expected_projects = v_snap_prop ->> 'expected_projects',
      duration = NULLIF(v_snap_prop ->> 'duration','')::int,
      topic_title = v_snap_prop ->> 'topic_title',
      uses_fstp = (v_snap_prop ->> 'uses_fstp')::boolean,
      cases_enabled = (v_snap_prop ->> 'cases_enabled')::boolean,
      cases_type = v_snap_prop ->> 'cases_type',
      use_wp_themes = (v_snap_prop ->> 'use_wp_themes')::boolean,
      is_two_stage_second_stage = (v_snap_prop ->> 'is_two_stage_second_stage')::boolean,
      topic_description = v_snap_prop ->> 'topic_description',
      topic_destination_description = v_snap_prop ->> 'topic_destination_description',
      topic_content_imported_at = NULLIF(v_snap_prop ->> 'topic_content_imported_at','')::timestamptz,
      reporting_periods = v_snap_prop -> 'reporting_periods',
      acronym_segments = v_snap_prop -> 'acronym_segments',
      decision_date_is_estimated = (v_snap_prop ->> 'decision_date_is_estimated')::boolean,
      opening_date = NULLIF(v_snap_prop ->> 'opening_date','')::timestamptz,
      indicative_budget_per_project = v_snap_prop ->> 'indicative_budget_per_project',
      fstp_budget = v_snap_prop ->> 'fstp_budget',
      fstp_budget_per_third_party = v_snap_prop ->> 'fstp_budget_per_third_party',
      total_budget_text = v_snap_prop ->> 'total_budget_text',
      topic_expected_outcome = v_snap_prop ->> 'topic_expected_outcome',
      topic_scope = v_snap_prop ->> 'topic_scope',
      topic_footnotes = v_snap_prop -> 'topic_footnotes',
      destination_footnotes = v_snap_prop -> 'destination_footnotes',
      outcome_footnotes = v_snap_prop -> 'outcome_footnotes',
      scope_footnotes = v_snap_prop -> 'scope_footnotes',
      requires_ocd = (v_snap_prop ->> 'requires_ocd')::boolean,
      ocd_template_path = v_snap_prop ->> 'ocd_template_path',
      fstp_type = v_snap_prop ->> 'fstp_type',
      wp_drafts_visible = (v_snap_prop ->> 'wp_drafts_visible')::boolean,
      case_drafts_visible = (v_snap_prop ->> 'case_drafts_visible')::boolean,
      case_include_number = (v_snap_prop ->> 'case_include_number')::boolean,
      case_include_abbreviation = (v_snap_prop ->> 'case_include_abbreviation')::boolean,
      evaluation_criteria_notes = v_snap_prop ->> 'evaluation_criteria_notes',
      banner_topic_line_override = v_snap_prop ->> 'banner_topic_line_override',
      banner_title_override = v_snap_prop ->> 'banner_title_override',
      b_subheadings_seeded = v_snap_prop -> 'b_subheadings_seeded',
      b31_banner_dismissed = (v_snap_prop ->> 'b31_banner_dismissed')::boolean,
      b31_show_travel_justification = (v_snap_prop ->> 'b31_show_travel_justification')::boolean,
      b31_show_other_goods_justification = (v_snap_prop ->> 'b31_show_other_goods_justification')::boolean,
      b31_show_purchase_costs = (v_snap_prop ->> 'b31_show_purchase_costs')::boolean,
      b31_show_equipment_justification = (v_snap_prop ->> 'b31_show_equipment_justification')::boolean,
      expertise_matrix_enabled = (v_snap_prop ->> 'expertise_matrix_enabled')::boolean,
      expertise_matrix_header_height = NULLIF(v_snap_prop ->> 'expertise_matrix_header_height','')::int,
      updated_at = now()
    WHERE id = p_proposal_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'proposal_id', p_proposal_id,
    'snapshot_id', p_snapshot_id,
    'pre_restore_snapshot_id', v_pre_id,
    'pre_restore_counts', v_pre_counts,
    'deleted', v_deleted_counts,
    'inserted', v_inserted_counts,
    'card_fields_moved_to_bin', v_binned,
    'proposals_columns_preserved', to_jsonb(ARRAY['id','created_at','created_by']),
    'excluded_tables_untouched', to_jsonb(v_excluded)
  );
END;
$function$;

-- 2. Drop the dead tables
DROP TABLE IF EXISTS public.member_wp_allocations CASCADE;
DROP TABLE IF EXISTS public.work_packages CASCADE;
DROP TABLE IF EXISTS public.section_footnotes CASCADE;
DROP TABLE IF EXISTS public.figure_references CASCADE;
DROP TABLE IF EXISTS public.comments CASCADE;
DROP TABLE IF EXISTS public.versions CASCADE;
DROP TABLE IF EXISTS public.direct_messages CASCADE;

-- 3. Drop the dead columns (figures.* deliberately retained: still read/written)
ALTER TABLE public.proposals DROP COLUMN IF EXISTS b32_infrastructure_order;
ALTER TABLE public.case_drafts DROP COLUMN IF EXISTS b12_populated;
ALTER TABLE public.participants DROP COLUMN IF EXISTS main_contact_access_granted_at;
ALTER TABLE public.participants DROP COLUMN IF EXISTS main_contact_access_granted_by;
ALTER TABLE public.participants DROP COLUMN IF EXISTS main_contact_access_requested_by;
ALTER TABLE public.part_a_data DROP COLUMN IF EXISTS additional_info;
ALTER TABLE public.proposal_user_onboarding DROP COLUMN IF EXISTS onboarded_at;

-- 4. Drop the dead RPCs
DROP FUNCTION IF EXISTS public.proposal_template_version(uuid);
DROP FUNCTION IF EXISTS public.restore_scope_predicates();