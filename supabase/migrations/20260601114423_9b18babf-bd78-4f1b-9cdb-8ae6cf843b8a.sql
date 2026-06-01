CREATE TABLE public.budget_personnel_breakdown (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_row_id uuid NOT NULL REFERENCES public.budget_rows(id) ON DELETE CASCADE,
  category text NOT NULL DEFAULT '',
  pm_count numeric NOT NULL DEFAULT 0,
  pm_rate numeric NOT NULL DEFAULT 0,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bpb_row ON public.budget_personnel_breakdown(budget_row_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_personnel_breakdown TO authenticated;
GRANT ALL ON public.budget_personnel_breakdown TO service_role;

ALTER TABLE public.budget_personnel_breakdown ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View personnel breakdown" ON public.budget_personnel_breakdown
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.budget_rows br
  WHERE br.id = budget_personnel_breakdown.budget_row_id
    AND public.has_any_proposal_role(auth.uid(), br.proposal_id)));

CREATE POLICY "Insert personnel breakdown" ON public.budget_personnel_breakdown
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.budget_rows br
  WHERE br.id = budget_personnel_breakdown.budget_row_id
    AND public.can_edit_proposal(auth.uid(), br.proposal_id)));

CREATE POLICY "Update personnel breakdown" ON public.budget_personnel_breakdown
FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.budget_rows br
  WHERE br.id = budget_personnel_breakdown.budget_row_id
    AND public.can_edit_proposal(auth.uid(), br.proposal_id)));

CREATE POLICY "Delete personnel breakdown" ON public.budget_personnel_breakdown
FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.budget_rows br
  WHERE br.id = budget_personnel_breakdown.budget_row_id
    AND public.can_edit_proposal(auth.uid(), br.proposal_id)));

CREATE TRIGGER bpb_set_updated_at
BEFORE UPDATE ON public.budget_personnel_breakdown
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();