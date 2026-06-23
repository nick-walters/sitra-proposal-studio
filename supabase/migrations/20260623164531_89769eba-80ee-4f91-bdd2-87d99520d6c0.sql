-- 1) Case subsection templates (per proposal)
CREATE TABLE public.case_subsection_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  key text NOT NULL,
  heading text NOT NULL,
  guideline text,
  order_index integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_subsection_templates TO authenticated;
GRANT ALL ON public.case_subsection_templates TO service_role;

ALTER TABLE public.case_subsection_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View case subsection templates with proposal access"
  ON public.case_subsection_templates FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Edit case subsection templates as editor+"
  ON public.case_subsection_templates FOR ALL TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE TRIGGER update_case_subsection_templates_updated_at
  BEFORE UPDATE ON public.case_subsection_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Generic subsection content + populate flag on case_drafts
ALTER TABLE public.case_drafts
  ADD COLUMN IF NOT EXISTS subsection_content jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS b12_populated boolean NOT NULL DEFAULT false;

-- 3) Migrate existing per-case content into subsection_content jsonb
UPDATE public.case_drafts
SET subsection_content = jsonb_strip_nulls(jsonb_build_object(
  'background_context', background_context,
  'key_stakeholders', key_stakeholders,
  'proposed_solutions', proposed_solutions,
  'expected_outcomes', expected_outcomes,
  'replicability', replicability
))
WHERE subsection_content = '{}'::jsonb;

-- 4) Seed default subsection templates for every existing proposal
INSERT INTO public.case_subsection_templates (proposal_id, key, heading, guideline, order_index, is_default)
SELECT p.id, t.key, t.heading, t.guideline, t.order_index, true
FROM public.proposals p
CROSS JOIN (VALUES
  ('background_context', 'Background context', 'Describe the context, problem statement, and rationale for this case.', 0),
  ('key_stakeholders', 'Key stakeholders', 'Identify the key actors involved and their roles.', 1),
  ('proposed_solutions', 'Proposed solutions', 'Outline the proposed approach, interventions, or activities.', 2),
  ('expected_outcomes', 'Expected outcomes', 'Describe the anticipated results, impact, and benefits.', 3),
  ('replicability', 'Replicability', 'Explain how the case can be scaled or replicated in other contexts.', 4)
) AS t(key, heading, guideline, order_index)
ON CONFLICT (proposal_id, key) DO NOTHING;

-- 5) Per-proposal seeding flag for retroactive B-section subheadings
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS b_subheadings_seeded jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 6) Drop the legacy auto-seed trigger for b31_tasks if it still exists (safety net)
DROP TRIGGER IF EXISTS initialize_b31_tasks_trigger ON public.wp_drafts;