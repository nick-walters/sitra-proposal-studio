CREATE TABLE public.budget_cost_justification_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_row_id uuid NOT NULL REFERENCES public.budget_rows(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('subcontracting','travel','equipment','other_goods')),
  amount numeric NOT NULL DEFAULT 0,
  justification text NOT NULL DEFAULT '',
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bcji_row_cat_order ON public.budget_cost_justification_items (budget_row_id, category, order_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.budget_cost_justification_items TO authenticated;
GRANT ALL ON public.budget_cost_justification_items TO service_role;

ALTER TABLE public.budget_cost_justification_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View justification items for proposals with access"
  ON public.budget_cost_justification_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.budget_rows br
                 WHERE br.id = budget_cost_justification_items.budget_row_id
                   AND public.has_any_proposal_role(auth.uid(), br.proposal_id)));

CREATE POLICY "Editors can insert justification items"
  ON public.budget_cost_justification_items FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.budget_rows br
                      WHERE br.id = budget_cost_justification_items.budget_row_id
                        AND public.can_edit_proposal(auth.uid(), br.proposal_id)
                        AND ((NOT br.is_locked) OR public.is_proposal_admin(auth.uid(), br.proposal_id))));

CREATE POLICY "Editors can update justification items"
  ON public.budget_cost_justification_items FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.budget_rows br
                 WHERE br.id = budget_cost_justification_items.budget_row_id
                   AND public.can_edit_proposal(auth.uid(), br.proposal_id)
                   AND ((NOT br.is_locked) OR public.is_proposal_admin(auth.uid(), br.proposal_id))));

CREATE POLICY "Editors can delete justification items"
  ON public.budget_cost_justification_items FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.budget_rows br
                 WHERE br.id = budget_cost_justification_items.budget_row_id
                   AND public.can_edit_proposal(auth.uid(), br.proposal_id)
                   AND ((NOT br.is_locked) OR public.is_proposal_admin(auth.uid(), br.proposal_id))));

CREATE TRIGGER update_bcji_updated_at
  BEFORE UPDATE ON public.budget_cost_justification_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Data migration scoped to disposable proposal 9d7716c3-e0cb-4bad-a862-1abc0acb97e4
DO $$
DECLARE
  v_proposal uuid := '9d7716c3-e0cb-4bad-a862-1abc0acb97e4';
BEGIN
  -- Subcontracting items → justification items
  INSERT INTO public.budget_cost_justification_items (budget_row_id, category, amount, justification, order_index)
  SELECT si.budget_row_id, 'subcontracting', COALESCE(si.amount,0), COALESCE(si.justification,''), COALESCE(si.order_index,0)
  FROM public.budget_subcontracting_items si
  JOIN public.budget_rows br ON br.id = si.budget_row_id
  WHERE br.proposal_id = v_proposal;

  -- Equipment items → justification items
  INSERT INTO public.budget_cost_justification_items (budget_row_id, category, amount, justification, order_index)
  SELECT ei.budget_row_id, 'equipment', COALESCE(ei.amount,0), COALESCE(ei.justification,''), COALESCE(ei.order_index,0)
  FROM public.budget_equipment_items ei
  JOIN public.budget_rows br ON br.id = ei.budget_row_id
  WHERE br.proposal_id = v_proposal;

  -- Travel justifications → single item with amount = current budget_rows.purchase_travel
  INSERT INTO public.budget_cost_justification_items (budget_row_id, category, amount, justification, order_index)
  SELECT br.id, 'travel', GREATEST(COALESCE(br.purchase_travel,0),0), COALESCE(j.justification_text,''), 0
  FROM public.budget_cost_justifications j
  JOIN public.budget_rows br ON br.id = j.budget_row_id
  WHERE br.proposal_id = v_proposal AND j.category = 'travel';

  -- Other goods justifications → single item
  INSERT INTO public.budget_cost_justification_items (budget_row_id, category, amount, justification, order_index)
  SELECT br.id, 'other_goods', GREATEST(COALESCE(br.purchase_other_goods,0),0), COALESCE(j.justification_text,''), 0
  FROM public.budget_cost_justifications j
  JOIN public.budget_rows br ON br.id = j.budget_row_id
  WHERE br.proposal_id = v_proposal AND j.category = 'other_goods';
END $$;