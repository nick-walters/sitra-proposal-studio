
-- Create budget_rows table
CREATE TABLE public.budget_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  role_label text NOT NULL DEFAULT 'Participant',
  personnel_costs numeric NOT NULL DEFAULT 0,
  subcontracting_costs numeric NOT NULL DEFAULT 0,
  purchase_travel numeric NOT NULL DEFAULT 0,
  purchase_equipment numeric NOT NULL DEFAULT 0,
  purchase_other_goods numeric NOT NULL DEFAULT 0,
  internally_invoiced numeric NOT NULL DEFAULT 0,
  indirect_costs_override numeric,
  funding_rate_override numeric,
  income_generated numeric NOT NULL DEFAULT 0,
  financial_contributions numeric NOT NULL DEFAULT 0,
  own_resources numeric NOT NULL DEFAULT 0,
  is_locked boolean NOT NULL DEFAULT false,
  locked_by uuid REFERENCES auth.users(id),
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, participant_id)
);

-- Create budget_cost_justifications table
CREATE TABLE public.budget_cost_justifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_row_id uuid NOT NULL REFERENCES public.budget_rows(id) ON DELETE CASCADE,
  category text NOT NULL,
  justification_text text NOT NULL DEFAULT '',
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (budget_row_id, category)
);

-- Enable RLS
ALTER TABLE public.budget_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_cost_justifications ENABLE ROW LEVEL SECURITY;

-- Updated-at triggers
CREATE TRIGGER update_budget_rows_updated_at
  BEFORE UPDATE ON public.budget_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_budget_cost_justifications_updated_at
  BEFORE UPDATE ON public.budget_cost_justifications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS for budget_rows
CREATE POLICY "Users with proposal access can view budget rows"
  ON public.budget_rows FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Users with edit access can insert budget rows"
  ON public.budget_rows FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Users with edit access can update unlocked budget rows"
  ON public.budget_rows FOR UPDATE TO authenticated
  USING (
    public.can_edit_proposal(auth.uid(), proposal_id)
    AND (NOT is_locked OR public.is_proposal_admin(auth.uid(), proposal_id))
  );

CREATE POLICY "Proposal admins can delete budget rows"
  ON public.budget_rows FOR DELETE TO authenticated
  USING (public.is_proposal_admin(auth.uid(), proposal_id));

-- RLS for budget_cost_justifications
CREATE POLICY "Users with proposal access can view justifications"
  ON public.budget_cost_justifications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_rows br
      WHERE br.id = budget_row_id
      AND public.has_any_proposal_role(auth.uid(), br.proposal_id)
    )
  );

CREATE POLICY "Users with edit access can insert justifications"
  ON public.budget_cost_justifications FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.budget_rows br
      WHERE br.id = budget_row_id
      AND public.can_edit_proposal(auth.uid(), br.proposal_id)
      AND (NOT br.is_locked OR public.is_proposal_admin(auth.uid(), br.proposal_id))
    )
  );

CREATE POLICY "Users with edit access can update justifications"
  ON public.budget_cost_justifications FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_rows br
      WHERE br.id = budget_row_id
      AND public.can_edit_proposal(auth.uid(), br.proposal_id)
      AND (NOT br.is_locked OR public.is_proposal_admin(auth.uid(), br.proposal_id))
    )
  );

CREATE POLICY "Proposal admins can delete justifications"
  ON public.budget_cost_justifications FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_rows br
      WHERE br.id = budget_row_id
      AND public.is_proposal_admin(auth.uid(), br.proposal_id)
    )
  );
