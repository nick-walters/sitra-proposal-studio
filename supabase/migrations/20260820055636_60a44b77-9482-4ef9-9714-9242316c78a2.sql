CREATE OR REPLACE FUNCTION public.versioned_table_allowed(p_table text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT p_table IN ('wp_drafts','wp_draft_tasks','wp_draft_deliverables',
                     'proposal_milestones','proposal_risks','case_drafts');
$$;

REVOKE ALL ON FUNCTION public.versioned_table_allowed(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.versioned_row_proposal(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_versioned_row(text, uuid, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_wp_draft(uuid, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_wp_draft_task(uuid, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_wp_draft_deliverable(uuid, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_proposal_milestone(uuid, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_proposal_risk(uuid, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_case_draft(uuid, jsonb, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reorder_versioned_rows(text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_case_draft_subsection(uuid, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bump_row_version() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.versioned_table_allowed(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.versioned_row_proposal(text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_versioned_row(text, uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_wp_draft(uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_wp_draft_task(uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_wp_draft_deliverable(uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_proposal_milestone(uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_proposal_risk(uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_case_draft(uuid, jsonb, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_versioned_rows(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_case_draft_subsection(uuid, text, text, text, text) TO authenticated, service_role;