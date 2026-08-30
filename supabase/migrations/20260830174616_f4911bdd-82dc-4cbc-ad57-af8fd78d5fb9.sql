CREATE OR REPLACE FUNCTION public.capture_scope_predicates()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT public.capture_scope_predicates_base()
         || jsonb_build_object(
              'case_draft_subsections', 'proposal_id = $1',
              'table_column_headers',   'proposal_id = $1',
              'proposal_row_bin',       'proposal_id = $1'
            );
$fn$;

CREATE OR REPLACE FUNCTION public.restore_in_scope_tables()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT public.restore_in_scope_tables_base()
         || ARRAY['case_draft_subsections','table_column_headers'];
$fn$;

CREATE OR REPLACE FUNCTION public.restore_excluded_tables()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $fn$
  SELECT ARRAY[
    'user_roles','user_availability',
    'proposal_analyses','evaluation_cost_log',
    'proposal_backups','proposal_snapshots',
    'notifications',
    'proposal_messages','proposal_message_recipients','message_stars',
    'pinned_proposals','proposal_user_onboarding',
    'comments',
    'proposal_templates','proposal_tasks','proposal_task_assignees',
    'proposal_progress','versions',
    'card_deletions','proposal_section_guidelines','proposal_row_bin'
  ];
$fn$;