CREATE OR REPLACE FUNCTION public.restore_proposal_snapshot(
  p_proposal_id uuid,
  p_snapshot_id uuid
)
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
  v_snap_prop jsonb;
  -- Delete order (children first). Insert order is the reverse.
  v_delete_order text[] := ARRAY[
    'member_wp_allocations',
    'wp_draft_deliverable_tasks',
    'wp_draft_task_participants',
    'wp_draft_task_effort',
    'wp_draft_deliverables',
    'wp_draft_tasks',
    'wp_draft_effort',
    'wp_dependencies',
    'proposal_milestone_wps',
    'proposal_risk_wps',
    'proposal_milestones',
    'proposal_risks',
    'wp_drafts',
    'wp_themes',
    'wp_color_palette',
    'work_packages',
    'expertise_matrix_cells',
    'expertise_matrix_columns',
    'expertise_matrix_rows',
    'budget_personnel_breakdown',
    'budget_cost_justification_items',
    'budget_items',
    'budget_rows',
    'effort_row_locks',
    'b12_ongoing_project_participants',
    'b12_ongoing_projects',
    'case_drafts',
    'proposal_case_types',
    'case_subsection_templates',
    'figure_references',
    'figures',
    'section_footnotes',
    'references',
    'section_content',
    'section_comments',
    'section_reviews',
    'section_visibility_locks',
    'table_captions',
    'table_column_widths',
    'fstp_content',
    'ethics_assessment',
    'part_a_data',
    'participant_ocd_uploads',
    'participant_organisation_roles',
    'participant_previous_projects',
    'participant_infrastructure',
    'participant_achievements',
    'participant_researchers',
    'participant_departments',
    'participant_dependencies',
    'participant_members',
    'participants',
    'part_a1'
  ];
BEGIN
  -- === GUARD ===
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: caller cannot edit this proposal';
  END IF;

  SELECT snapshot, proposal_id INTO v_snapshot, v_snap_pid
    FROM proposal_snapshots WHERE id = p_snapshot_id;
  IF v_snapshot IS NULL THEN
    RAISE EXCEPTION 'Snapshot % not found', p_snapshot_id;
  END IF;
  IF v_snap_pid <> p_proposal_id THEN
    RAISE EXCEPTION 'Snapshot belongs to a different proposal (%): refusing cross-proposal restore', v_snap_pid;
  END IF;

  -- === PRE-RESTORE AUTO-SNAPSHOT (so this restore is itself undoable) ===
  SELECT snapshot_id, counts
    INTO v_pre_id, v_pre_counts
    FROM public.create_proposal_snapshot(p_proposal_id, 'pre-restore auto', 'pre-restore');
  IF v_pre_id IS NULL THEN
    RAISE EXCEPTION 'Aborting restore: pre-restore snapshot failed';
  END IF;

  -- Assert in-scope arrays are consistent (defense in depth)
  IF cardinality(v_in_scope) <> cardinality(v_delete_order) THEN
    RAISE EXCEPTION 'restore_in_scope_tables (%) and internal delete order (%) are out of sync',
      cardinality(v_in_scope), cardinality(v_delete_order);
  END IF;

  -- === DELETE PHASE (children -> parents) ===
  FOREACH v_tbl IN ARRAY v_delete_order LOOP
    v_predicate := v_scope ->> ('"' || v_tbl || '"');
    IF v_predicate IS NULL THEN
      RAISE EXCEPTION 'No scope predicate for table %', v_tbl;
    END IF;
    EXECUTE format('DELETE FROM %I WHERE %s', v_tbl, v_predicate) USING p_proposal_id;
    GET DIAGNOSTICS v_del = ROW_COUNT;
    v_deleted_counts := v_deleted_counts || jsonb_build_object(v_tbl, v_del);
  END LOOP;

  -- === INSERT PHASE (parents -> children) : reverse of delete order ===
  FOR i IN REVERSE array_length(v_delete_order, 1) .. 1 LOOP
    v_tbl := v_delete_order[i];
    v_rows := COALESCE(v_snapshot -> v_tbl, '[]'::jsonb);
    IF jsonb_array_length(v_rows) = 0 THEN
      v_inserted_counts := v_inserted_counts || jsonb_build_object(v_tbl, 0);
      CONTINUE;
    END IF;

    IF v_tbl = 'section_comments' THEN
      -- Self-referential FK: insert with parent_comment_id NULL, then fix up.
      EXECUTE format($ins$
        INSERT INTO %I
        SELECT (r).* FROM (
          SELECT jsonb_populate_recordset(NULL::%I,
            (SELECT jsonb_agg(e - 'parent_comment_id') FROM jsonb_array_elements($1) e)
          ) AS r
        ) s
      $ins$, v_tbl, v_tbl) USING v_rows;

      EXECUTE format($upd$
        UPDATE %I t
        SET parent_comment_id = (e.elem ->> 'parent_comment_id')::uuid
        FROM (SELECT jsonb_array_elements($1) AS elem) e
        WHERE t.id = (e.elem ->> 'id')::uuid
          AND e.elem ? 'parent_comment_id'
          AND e.elem ->> 'parent_comment_id' IS NOT NULL
      $upd$, v_tbl) USING v_rows;

      GET DIAGNOSTICS v_ins = ROW_COUNT;
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

  -- === PROPOSALS row: restore CONTENT columns, preserve OWNERSHIP/AUDIT columns ===
  v_snap_prop := v_snapshot -> 'proposals' -> 0;
  IF v_snap_prop IS NOT NULL THEN
    UPDATE proposals SET
      acronym                              = v_snap_prop ->> 'acronym',
      title                                = v_snap_prop ->> 'title',
      type                                 = (v_snap_prop ->> 'type')::proposal_type,
      status                               = COALESCE((v_snap_prop ->> 'status')::proposal_status, status),
      budget_type                          = (v_snap_prop ->> 'budget_type')::budget_type,
      topic_url                            = v_snap_prop ->> 'topic_url',
      topic_id                             = v_snap_prop ->> 'topic_id',
      total_budget                         = NULLIF(v_snap_prop ->> 'total_budget','')::numeric,
      deadline                             = NULLIF(v_snap_prop ->> 'deadline','')::timestamptz,
      description                          = v_snap_prop ->> 'description',
      work_programme                       = v_snap_prop ->> 'work_programme',
      destination                          = v_snap_prop ->> 'destination',
      logo_url                             = v_snap_prop ->> 'logo_url',
      submitted_at                         = NULLIF(v_snap_prop ->> 'submitted_at','')::timestamptz,
      decision_date                        = NULLIF(v_snap_prop ->> 'decision_date','')::timestamptz,
      template_type_id                     = NULLIF(v_snap_prop ->> 'template_type_id','')::uuid,
      budget_template_id                   = NULLIF(v_snap_prop ->> 'budget_template_id','')::uuid,
      submission_stage                     = v_snap_prop ->> 'submission_stage',
      expected_projects                    = v_snap_prop ->> 'expected_projects',
      duration                             = NULLIF(v_snap_prop ->> 'duration','')::int,
      topic_title                          = v_snap_prop ->> 'topic_title',
      uses_fstp                            = (v_snap_prop ->> 'uses_fstp')::boolean,
      cases_enabled                        = (v_snap_prop ->> 'cases_enabled')::boolean,
      cases_type                           = v_snap_prop ->> 'cases_type',
      use_wp_themes                        = (v_snap_prop ->> 'use_wp_themes')::boolean,
      is_two_stage_second_stage            = (v_snap_prop ->> 'is_two_stage_second_stage')::boolean,
      topic_description                    = v_snap_prop ->> 'topic_description',
      topic_destination_description        = v_snap_prop ->> 'topic_destination_description',
      topic_content_imported_at            = NULLIF(v_snap_prop ->> 'topic_content_imported_at','')::timestamptz,
      reporting_periods                    = v_snap_prop -> 'reporting_periods',
      acronym_segments                     = v_snap_prop -> 'acronym_segments',
      decision_date_is_estimated           = (v_snap_prop ->> 'decision_date_is_estimated')::boolean,
      opening_date                         = NULLIF(v_snap_prop ->> 'opening_date','')::timestamptz,
      indicative_budget_per_project        = v_snap_prop ->> 'indicative_budget_per_project',
      fstp_budget                          = v_snap_prop ->> 'fstp_budget',
      fstp_budget_per_third_party          = v_snap_prop ->> 'fstp_budget_per_third_party',
      total_budget_text                    = v_snap_prop ->> 'total_budget_text',
      topic_expected_outcome               = v_snap_prop ->> 'topic_expected_outcome',
      topic_scope                          = v_snap_prop ->> 'topic_scope',
      topic_footnotes                      = v_snap_prop -> 'topic_footnotes',
      destination_footnotes                = v_snap_prop -> 'destination_footnotes',
      outcome_footnotes                    = v_snap_prop -> 'outcome_footnotes',
      scope_footnotes                      = v_snap_prop -> 'scope_footnotes',
      requires_ocd                         = (v_snap_prop ->> 'requires_ocd')::boolean,
      ocd_template_path                    = v_snap_prop ->> 'ocd_template_path',
      fstp_type                            = v_snap_prop ->> 'fstp_type',
      wp_drafts_visible                    = (v_snap_prop ->> 'wp_drafts_visible')::boolean,
      case_drafts_visible                  = (v_snap_prop ->> 'case_drafts_visible')::boolean,
      case_include_number                  = (v_snap_prop ->> 'case_include_number')::boolean,
      case_include_abbreviation            = (v_snap_prop ->> 'case_include_abbreviation')::boolean,
      evaluation_criteria_notes            = v_snap_prop ->> 'evaluation_criteria_notes',
      banner_topic_line_override           = v_snap_prop ->> 'banner_topic_line_override',
      banner_title_override                = v_snap_prop ->> 'banner_title_override',
      b_subheadings_seeded                 = v_snap_prop -> 'b_subheadings_seeded',
      b31_banner_dismissed                 = (v_snap_prop ->> 'b31_banner_dismissed')::boolean,
      b31_show_travel_justification        = (v_snap_prop ->> 'b31_show_travel_justification')::boolean,
      b31_show_other_goods_justification   = (v_snap_prop ->> 'b31_show_other_goods_justification')::boolean,
      b31_show_fstp_justification          = (v_snap_prop ->> 'b31_show_fstp_justification')::boolean,
      b31_show_internally_invoiced_justification = (v_snap_prop ->> 'b31_show_internally_invoiced_justification')::boolean,
      b31_show_all_equipment_justification = (v_snap_prop ->> 'b31_show_all_equipment_justification')::boolean,
      b31_show_purchase_costs              = (v_snap_prop ->> 'b31_show_purchase_costs')::boolean,
      b31_show_other_direct_costs          = (v_snap_prop ->> 'b31_show_other_direct_costs')::boolean,
      b31_show_equipment_justification     = (v_snap_prop ->> 'b31_show_equipment_justification')::boolean,
      expertise_matrix_enabled             = (v_snap_prop ->> 'expertise_matrix_enabled')::boolean,
      expertise_matrix_header_height       = NULLIF(v_snap_prop ->> 'expertise_matrix_header_height','')::int,
      updated_at                           = now()
    WHERE id = p_proposal_id;
    -- Preserved (deliberately NOT restored): id, created_at, created_by
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'proposal_id', p_proposal_id,
    'snapshot_id', p_snapshot_id,
    'pre_restore_snapshot_id', v_pre_id,
    'pre_restore_counts', v_pre_counts,
    'deleted', v_deleted_counts,
    'inserted', v_inserted_counts,
    'proposals_columns_preserved', to_jsonb(ARRAY['id','created_at','created_by']),
    'excluded_tables_untouched', to_jsonb(v_excluded)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_proposal_snapshot(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_proposal_snapshot(uuid, uuid) TO authenticated;