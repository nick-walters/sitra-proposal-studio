
-- ============ b12_cases ============
CREATE TABLE public.b12_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  case_draft_id uuid REFERENCES public.case_drafts(id) ON DELETE SET NULL,
  number integer,
  case_type text,
  custom_type_name text,
  short_name text,
  title text,
  color text,
  lead_participant_id uuid REFERENCES public.participants(id) ON DELETE SET NULL,
  order_index integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX b12_cases_proposal_id_idx ON public.b12_cases(proposal_id);
CREATE INDEX b12_cases_case_draft_id_idx ON public.b12_cases(case_draft_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b12_cases TO authenticated;
GRANT ALL ON public.b12_cases TO service_role;

ALTER TABLE public.b12_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view b12_cases for their proposals"
  ON public.b12_cases FOR SELECT
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Users can insert b12_cases for their proposals"
  ON public.b12_cases FOR INSERT
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Users can update b12_cases for their proposals"
  ON public.b12_cases FOR UPDATE
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Users can delete b12_cases for their proposals"
  ON public.b12_cases FOR DELETE
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE TRIGGER update_b12_cases_updated_at
  BEFORE UPDATE ON public.b12_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ b12_case_subsections ============
CREATE TABLE public.b12_case_subsections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  b12_case_id uuid NOT NULL REFERENCES public.b12_cases(id) ON DELETE CASCADE,
  subsection_key text NOT NULL,
  heading text,
  body text,
  order_index integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX b12_case_subsections_b12_case_id_idx ON public.b12_case_subsections(b12_case_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.b12_case_subsections TO authenticated;
GRANT ALL ON public.b12_case_subsections TO service_role;

ALTER TABLE public.b12_case_subsections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view b12_case_subsections"
  ON public.b12_case_subsections FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.b12_cases bc
    WHERE bc.id = b12_case_subsections.b12_case_id
      AND public.has_any_proposal_role(auth.uid(), bc.proposal_id)
  ));

CREATE POLICY "Users can insert b12_case_subsections"
  ON public.b12_case_subsections FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.b12_cases bc
    WHERE bc.id = b12_case_subsections.b12_case_id
      AND public.can_edit_proposal(auth.uid(), bc.proposal_id)
  ));

CREATE POLICY "Users can update b12_case_subsections"
  ON public.b12_case_subsections FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.b12_cases bc
    WHERE bc.id = b12_case_subsections.b12_case_id
      AND public.can_edit_proposal(auth.uid(), bc.proposal_id)
  ));

CREATE POLICY "Users can delete b12_case_subsections"
  ON public.b12_case_subsections FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.b12_cases bc
    WHERE bc.id = b12_case_subsections.b12_case_id
      AND public.can_edit_proposal(auth.uid(), bc.proposal_id)
  ));
