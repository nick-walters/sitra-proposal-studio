CREATE TABLE public.case_guideline_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  title text NOT NULL,
  content text NOT NULL,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.case_guideline_defaults TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.case_guideline_defaults TO authenticated;
GRANT ALL ON public.case_guideline_defaults TO service_role;

ALTER TABLE public.case_guideline_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read case guidance defaults"
  ON public.case_guideline_defaults FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Sitra staff manage case guidance defaults"
  ON public.case_guideline_defaults FOR ALL TO authenticated
  USING (public.is_global_admin(auth.uid()) OR public.caller_is_sitra_staff())
  WITH CHECK (public.is_global_admin(auth.uid()) OR public.caller_is_sitra_staff());

CREATE TRIGGER update_case_guideline_defaults_updated_at
  BEFORE UPDATE ON public.case_guideline_defaults
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.case_guideline_defaults (key, title, content, order_index) VALUES
  ('background_context', 'Background context', 'Describe the context, problem statement, and rationale for this case.', 0),
  ('key_stakeholders', 'Key stakeholders', 'Identify the key actors involved and their roles.', 1),
  ('proposed_solutions', 'Proposed solutions', 'Outline the proposed approach, interventions, or activities.', 2),
  ('expected_outcomes', 'Expected outcomes', 'Describe the anticipated results, impact, and benefits.', 3),
  ('replicability', 'Replicability', 'Explain how the case can be scaled or replicated in other contexts.', 4)
ON CONFLICT (key) DO NOTHING;

-- Proposals that merely carry a verbatim copy of the seeded text hold no real
-- override: clear them so the shared default resolves instead.
UPDATE public.case_subsection_templates t
SET guideline = NULL
FROM public.case_guideline_defaults d
WHERE d.key = t.key
  AND btrim(coalesce(t.guideline, '')) = btrim(d.content);

CREATE OR REPLACE FUNCTION public.save_case_subsection_guideline(
  p_template_id uuid,
  p_guideline text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid uuid;
BEGIN
  SELECT proposal_id INTO v_pid FROM public.case_subsection_templates WHERE id = p_template_id;
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'Subsection not found';
  END IF;
  IF NOT public.is_coordinator_or_above(auth.uid(), v_pid) THEN
    RAISE EXCEPTION 'Only a coordinator or above may edit case guidance';
  END IF;
  UPDATE public.case_subsection_templates
  SET guideline = NULLIF(btrim(coalesce(p_guideline, '')), '')
  WHERE id = p_template_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_case_subsection_guideline(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_case_subsection_guideline(uuid, text) TO authenticated;