ALTER TABLE public.methodology_subsections ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.methodology_items ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.methodology_linked_activities ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

DROP TRIGGER IF EXISTS bump_version_methodology_subsections ON public.methodology_subsections;
CREATE TRIGGER bump_version_methodology_subsections BEFORE INSERT OR UPDATE ON public.methodology_subsections
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
DROP TRIGGER IF EXISTS bump_version_methodology_items ON public.methodology_items;
CREATE TRIGGER bump_version_methodology_items BEFORE INSERT OR UPDATE ON public.methodology_items
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();
DROP TRIGGER IF EXISTS bump_version_methodology_linked_activities ON public.methodology_linked_activities;
CREATE TRIGGER bump_version_methodology_linked_activities BEFORE INSERT OR UPDATE ON public.methodology_linked_activities
  FOR EACH ROW EXECUTE FUNCTION public.bump_row_version();

CREATE OR REPLACE FUNCTION public.versioned_table_allowed(p_table text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_table IN ('wp_drafts','wp_draft_tasks','wp_draft_deliverables',
                     'proposal_milestones','proposal_risks','case_drafts',
                     'methodology_subsections','methodology_items',
                     'methodology_linked_activities');
$$;

DROP FUNCTION IF EXISTS public.save_wp_draft(uuid, jsonb, integer);
DROP FUNCTION IF EXISTS public.save_wp_draft_task(uuid, jsonb, integer);
DROP FUNCTION IF EXISTS public.save_wp_draft_deliverable(uuid, jsonb, integer);
DROP FUNCTION IF EXISTS public.save_case_draft(uuid, jsonb, integer);
DROP FUNCTION IF EXISTS public.save_proposal_milestone(uuid, jsonb, integer);
DROP FUNCTION IF EXISTS public.save_proposal_risk(uuid, jsonb, integer);