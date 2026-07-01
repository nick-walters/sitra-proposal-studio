
-- 1. Snapshot table
CREATE TABLE public.proposal_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  label text,
  source text,
  table_counts jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX proposal_snapshots_proposal_created_idx
  ON public.proposal_snapshots (proposal_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.proposal_snapshots TO authenticated;
GRANT ALL ON public.proposal_snapshots TO service_role;

ALTER TABLE public.proposal_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view snapshots"
  ON public.proposal_snapshots FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Editors can create snapshots"
  ON public.proposal_snapshots FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Editors can delete snapshots"
  ON public.proposal_snapshots FOR DELETE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

-- 2. Capture function
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
  v_snapshot jsonb;
  v_counts jsonb;
  v_id uuid;
  v_participant_ids uuid[];
  v_wp_draft_ids uuid[];
  v_wp_task_ids uuid[];
  v_budget_row_ids uuid[];
  v_milestone_ids uuid[];
  v_risk_ids uuid[];
  v_matrix_row_ids uuid[];
  v_ongoing_ids uuid[];
  v_figure_ids uuid[];
  v_message_ids uuid[];
  v_task_ids uuid[];
  v_member_ids uuid[];
  v_work_package_ids uuid[];
  v_section_content_ids uuid[];
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: caller cannot edit this proposal';
  END IF;

  -- Precompute child id sets
  SELECT array_agg(id) INTO v_participant_ids FROM participants WHERE proposal_id = p_proposal_id;
  SELECT array_agg(id) INTO v_wp_draft_ids   FROM wp_drafts    WHERE proposal_id = p_proposal_id;
  SELECT array_agg(id) INTO v_wp_task_ids    FROM wp_draft_tasks WHERE wp_draft_id = ANY(COALESCE(v_wp_draft_ids,'{}'::uuid[]));
  SELECT array_agg(id) INTO v_budget_row_ids FROM budget_rows  WHERE proposal_id = p_proposal_id;
  SELECT array_agg(id) INTO v_milestone_ids  FROM proposal_milestones WHERE proposal_id = p_proposal_id;
  SELECT array_agg(id) INTO v_risk_ids       FROM proposal_risks WHERE proposal_id = p_proposal_id;
  SELECT array_agg(id) INTO v_matrix_row_ids FROM expertise_matrix_rows WHERE proposal_id = p_proposal_id;
  SELECT array_agg(id) INTO v_ongoing_ids    FROM b12_ongoing_projects WHERE proposal_id = p_proposal_id;
  SELECT array_agg(id) INTO v_figure_ids     FROM figures     WHERE proposal_id = p_proposal_id;
  SELECT array_agg(id) INTO v_message_ids    FROM proposal_messages WHERE proposal_id = p_proposal_id;
  SELECT array_agg(id) INTO v_task_ids       FROM proposal_tasks WHERE proposal_id = p_proposal_id;
  SELECT array_agg(id) INTO v_work_package_ids FROM work_packages WHERE proposal_id = p_proposal_id;
  SELECT array_agg(pm.id) INTO v_member_ids  FROM participant_members pm WHERE pm.participant_id = ANY(COALESCE(v_participant_ids,'{}'::uuid[]));
  SELECT array_agg(id) INTO v_section_content_ids FROM section_content WHERE proposal_id = p_proposal_id;

  v_snapshot := jsonb_build_object(
    -- Root
    'proposals',                       (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM proposals t WHERE t.id = p_proposal_id),
    'part_a1',                         (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM part_a1 t WHERE t.proposal_id = p_proposal_id),

    -- Participants + children
    'participants',                    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM participants t WHERE t.proposal_id = p_proposal_id),
    'participant_departments',         (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM participant_departments t WHERE t.participant_id = ANY(COALESCE(v_participant_ids,'{}'::uuid[]))),
    'participant_members',             (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM participant_members t WHERE t.participant_id = ANY(COALESCE(v_participant_ids,'{}'::uuid[]))),
    'participant_researchers',         (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM participant_researchers t WHERE t.participant_id = ANY(COALESCE(v_participant_ids,'{}'::uuid[]))),
    'participant_achievements',        (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM participant_achievements t WHERE t.participant_id = ANY(COALESCE(v_participant_ids,'{}'::uuid[]))),
    'participant_infrastructure',      (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM participant_infrastructure t WHERE t.participant_id = ANY(COALESCE(v_participant_ids,'{}'::uuid[]))),
    'participant_previous_projects',   (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM participant_previous_projects t WHERE t.participant_id = ANY(COALESCE(v_participant_ids,'{}'::uuid[]))),
    'participant_dependencies',        (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM participant_dependencies t WHERE t.participant_id = ANY(COALESCE(v_participant_ids,'{}'::uuid[]))),
    'participant_organisation_roles',  (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM participant_organisation_roles t WHERE t.participant_id = ANY(COALESCE(v_participant_ids,'{}'::uuid[]))),
    'participant_ocd_uploads',         (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM participant_ocd_uploads t WHERE t.proposal_id = p_proposal_id),
    'part_a_data',                     (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM part_a_data t WHERE t.participant_id = ANY(COALESCE(v_participant_ids,'{}'::uuid[]))),
    'member_wp_allocations',           (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM member_wp_allocations t WHERE t.member_id = ANY(COALESCE(v_member_ids,'{}'::uuid[]))),

    -- WP drafts + children
    'wp_drafts',                       (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM wp_drafts t WHERE t.proposal_id = p_proposal_id),
    'wp_draft_tasks',                  (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM wp_draft_tasks t WHERE t.wp_draft_id = ANY(COALESCE(v_wp_draft_ids,'{}'::uuid[]))),
    'wp_draft_deliverables',           (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM wp_draft_deliverables t WHERE t.wp_draft_id = ANY(COALESCE(v_wp_draft_ids,'{}'::uuid[]))),
    'wp_draft_effort',                 (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM wp_draft_effort t WHERE t.wp_draft_id = ANY(COALESCE(v_wp_draft_ids,'{}'::uuid[]))),
    'wp_draft_task_effort',            (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM wp_draft_task_effort t WHERE t.task_id = ANY(COALESCE(v_wp_task_ids,'{}'::uuid[]))),
    'wp_draft_task_participants',      (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM wp_draft_task_participants t WHERE t.task_id = ANY(COALESCE(v_wp_task_ids,'{}'::uuid[]))),
    'wp_draft_deliverable_tasks',      (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM wp_draft_deliverable_tasks t WHERE t.wp_draft_task_id = ANY(COALESCE(v_wp_task_ids,'{}'::uuid[]))),
    'wp_color_palette',                (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM wp_color_palette t WHERE t.proposal_id = p_proposal_id),
    'wp_themes',                       (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM wp_themes t WHERE t.proposal_id = p_proposal_id),
    'wp_dependencies',                 (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM wp_dependencies t WHERE t.proposal_id = p_proposal_id),
    'work_packages',                   (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM work_packages t WHERE t.proposal_id = p_proposal_id),

    -- Milestones & risks
    'proposal_milestones',             (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM proposal_milestones t WHERE t.proposal_id = p_proposal_id),
    'proposal_milestone_wps',          (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM proposal_milestone_wps t WHERE t.milestone_id = ANY(COALESCE(v_milestone_ids,'{}'::uuid[]))),
    'proposal_risks',                  (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM proposal_risks t WHERE t.proposal_id = p_proposal_id),
    'proposal_risk_wps',               (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM proposal_risk_wps t WHERE t.risk_id = ANY(COALESCE(v_risk_ids,'{}'::uuid[]))),

    -- Expertise matrix
    'expertise_matrix_rows',           (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM expertise_matrix_rows t WHERE t.proposal_id = p_proposal_id),
    'expertise_matrix_columns',        (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM expertise_matrix_columns t WHERE t.proposal_id = p_proposal_id),
    'expertise_matrix_cells',          (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM expertise_matrix_cells t WHERE t.row_id = ANY(COALESCE(v_matrix_row_ids,'{}'::uuid[]))),

    -- Budget
    'budget_rows',                     (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM budget_rows t WHERE t.proposal_id = p_proposal_id),
    'budget_items',                    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM budget_items t WHERE t.proposal_id = p_proposal_id),
    'budget_personnel_breakdown',      (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM budget_personnel_breakdown t WHERE t.budget_row_id = ANY(COALESCE(v_budget_row_ids,'{}'::uuid[]))),
    'budget_cost_justification_items', (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM budget_cost_justification_items t WHERE t.budget_row_id = ANY(COALESCE(v_budget_row_ids,'{}'::uuid[]))),
    'effort_row_locks',                (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM effort_row_locks t WHERE t.proposal_id = p_proposal_id),

    -- Cases
    'case_drafts',                     (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM case_drafts t WHERE t.proposal_id = p_proposal_id),
    'proposal_case_types',             (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM proposal_case_types t WHERE t.proposal_id = p_proposal_id),
    'case_subsection_templates',       (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM case_subsection_templates t WHERE t.proposal_id = p_proposal_id),

    -- B1.2 ongoing
    'b12_ongoing_projects',            (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM b12_ongoing_projects t WHERE t.proposal_id = p_proposal_id),
    'b12_ongoing_project_participants',(SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM b12_ongoing_project_participants t WHERE t.ongoing_project_id = ANY(COALESCE(v_ongoing_ids,'{}'::uuid[]))),

    -- Section content & history
    'section_content',                 (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM section_content t WHERE t.proposal_id = p_proposal_id),
    'section_versions',                (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM section_versions t WHERE t.proposal_id = p_proposal_id),
    'section_tracked_changes',         (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM section_tracked_changes t WHERE t.proposal_id = p_proposal_id),
    'section_comments',                (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM section_comments t WHERE t.proposal_id = p_proposal_id),
    'section_reviews',                 (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM section_reviews t WHERE t.proposal_id = p_proposal_id),
    'section_visibility_locks',        (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM section_visibility_locks t WHERE t.proposal_id = p_proposal_id),
    'section_footnotes',               (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM section_footnotes t WHERE t.section_content_id = ANY(COALESCE(v_section_content_ids,'{}'::uuid[]))),

    -- References, tables, figures
    'references',                      (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM "references" t WHERE t.proposal_id = p_proposal_id),
    'table_captions',                  (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM table_captions t WHERE t.proposal_id = p_proposal_id),
    'table_column_widths',             (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM table_column_widths t WHERE t.proposal_id = p_proposal_id),
    'figures',                         (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM figures t WHERE t.proposal_id = p_proposal_id),
    'figure_references',               (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM figure_references t WHERE t.figure_id = ANY(COALESCE(v_figure_ids,'{}'::uuid[]))),

    -- FSTP, ethics
    'fstp_content',                    (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM fstp_content t WHERE t.proposal_id = p_proposal_id),
    'ethics_assessment',               (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM ethics_assessment t WHERE t.proposal_id = p_proposal_id),

    -- Tasks, messages, comments
    'proposal_tasks',                  (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM proposal_tasks t WHERE t.proposal_id = p_proposal_id),
    'proposal_task_assignees',         (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM proposal_task_assignees t WHERE t.task_id = ANY(COALESCE(v_task_ids,'{}'::uuid[]))),
    'proposal_messages',               (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM proposal_messages t WHERE t.proposal_id = p_proposal_id),
    'proposal_message_recipients',     (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM proposal_message_recipients t WHERE t.message_id = ANY(COALESCE(v_message_ids,'{}'::uuid[]))),
    'message_stars',                   (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM message_stars t WHERE t.message_id = ANY(COALESCE(v_message_ids,'{}'::uuid[]))),
    'comments',                        (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM comments t WHERE t.proposal_id = p_proposal_id),

    -- Progress, onboarding, roles, misc
    'proposal_progress',               (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM proposal_progress t WHERE t.proposal_id = p_proposal_id),
    'proposal_user_onboarding',        (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM proposal_user_onboarding t WHERE t.proposal_id = p_proposal_id),
    'proposal_templates',              (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM proposal_templates t WHERE t.proposal_id = p_proposal_id),
    'user_roles',                      (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM user_roles t WHERE t.proposal_id = p_proposal_id),
    'user_availability',               (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM user_availability t WHERE t.proposal_id = p_proposal_id),
    'pinned_proposals',                (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM pinned_proposals t WHERE t.proposal_id = p_proposal_id),
    'notifications',                   (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM notifications t WHERE t.proposal_id = p_proposal_id),
    'proposal_analyses',               (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM proposal_analyses t WHERE t.proposal_id = p_proposal_id),
    'proposal_backups',                (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM proposal_backups t WHERE t.proposal_id = p_proposal_id),
    'versions',                        (SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb) FROM versions t WHERE t.proposal_id = p_proposal_id)
  );

  -- Row counts
  SELECT jsonb_object_agg(key, jsonb_array_length(value))
    INTO v_counts
    FROM jsonb_each(v_snapshot);

  INSERT INTO proposal_snapshots (proposal_id, snapshot, label, source, table_counts, created_by)
  VALUES (p_proposal_id, v_snapshot, p_label, p_source, v_counts, auth.uid())
  RETURNING id INTO v_id;

  RETURN QUERY SELECT v_id, v_counts;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_proposal_snapshot(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_proposal_snapshot(uuid, text, text) TO authenticated;

-- 3. Retention helper (not scheduled)
CREATE OR REPLACE FUNCTION public.thin_proposal_snapshots(
  p_proposal_id uuid,
  p_keep_manual integer DEFAULT 10,
  p_keep_auto integer DEFAULT 10
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_deleted integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: caller cannot edit this proposal';
  END IF;

  WITH ranked AS (
    SELECT id,
      row_number() OVER (
        PARTITION BY CASE WHEN source = 'auto' THEN 'auto' ELSE 'manual' END
        ORDER BY created_at DESC
      ) AS rn,
      source
    FROM proposal_snapshots
    WHERE proposal_id = p_proposal_id
  ), to_delete AS (
    SELECT id FROM ranked
    WHERE (source = 'auto' AND rn > p_keep_auto)
       OR (source IS DISTINCT FROM 'auto' AND rn > p_keep_manual)
  )
  DELETE FROM proposal_snapshots ps
  USING to_delete d
  WHERE ps.id = d.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$fn$;

REVOKE ALL ON FUNCTION public.thin_proposal_snapshots(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.thin_proposal_snapshots(uuid, integer, integer) TO authenticated;
