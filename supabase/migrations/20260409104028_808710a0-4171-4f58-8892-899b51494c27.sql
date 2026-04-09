CREATE TABLE public.proposal_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  analysis_data JSONB NOT NULL,
  overall_score NUMERIC(4,1),
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_proposal_analyses_proposal_id ON public.proposal_analyses(proposal_id);
CREATE INDEX idx_proposal_analyses_created_at ON public.proposal_analyses(proposal_id, created_at DESC);

ALTER TABLE public.proposal_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with proposal access can view analyses"
  ON public.proposal_analyses FOR SELECT
  TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Editors and above can create analyses"
  ON public.proposal_analyses FOR INSERT
  TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Coordinators can delete analyses"
  ON public.proposal_analyses FOR DELETE
  TO authenticated
  USING (public.is_proposal_admin(auth.uid(), proposal_id));