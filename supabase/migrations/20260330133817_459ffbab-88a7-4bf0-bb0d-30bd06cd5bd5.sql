
-- Subcontracting line items table
CREATE TABLE public.budget_subcontracting_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_row_id UUID NOT NULL REFERENCES public.budget_rows(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  justification TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add purchase_equipment_justification to budget_rows for the 15% threshold justification
ALTER TABLE public.budget_rows ADD COLUMN IF NOT EXISTS purchase_equipment_justification TEXT DEFAULT '';

-- RLS
ALTER TABLE public.budget_subcontracting_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view subcontracting items for proposals they have access to"
  ON public.budget_subcontracting_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_rows br
      WHERE br.id = budget_row_id
        AND public.has_any_proposal_role(auth.uid(), br.proposal_id)
    )
  );

CREATE POLICY "Editors can insert subcontracting items"
  ON public.budget_subcontracting_items FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.budget_rows br
      WHERE br.id = budget_row_id
        AND public.can_edit_proposal(auth.uid(), br.proposal_id)
    )
  );

CREATE POLICY "Editors can update subcontracting items"
  ON public.budget_subcontracting_items FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_rows br
      WHERE br.id = budget_row_id
        AND public.can_edit_proposal(auth.uid(), br.proposal_id)
    )
  );

CREATE POLICY "Editors can delete subcontracting items"
  ON public.budget_subcontracting_items FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.budget_rows br
      WHERE br.id = budget_row_id
        AND public.can_edit_proposal(auth.uid(), br.proposal_id)
    )
  );

-- Trigger for updated_at
CREATE TRIGGER update_budget_subcontracting_items_updated_at
  BEFORE UPDATE ON public.budget_subcontracting_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
