CREATE TABLE public.budget_equipment_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_row_id UUID NOT NULL REFERENCES public.budget_rows(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  justification TEXT NOT NULL DEFAULT '',
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.budget_equipment_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view equipment items for their proposals"
ON public.budget_equipment_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.budget_rows br
    JOIN public.proposals p ON p.id = br.proposal_id
    WHERE br.id = budget_equipment_items.budget_row_id
    AND public.has_any_proposal_role(auth.uid(), p.id)
  )
);

CREATE POLICY "Users can insert equipment items for editable proposals"
ON public.budget_equipment_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.budget_rows br
    JOIN public.proposals p ON p.id = br.proposal_id
    WHERE br.id = budget_equipment_items.budget_row_id
    AND public.can_edit_proposal(auth.uid(), p.id)
  )
);

CREATE POLICY "Users can update equipment items for editable proposals"
ON public.budget_equipment_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.budget_rows br
    JOIN public.proposals p ON p.id = br.proposal_id
    WHERE br.id = budget_equipment_items.budget_row_id
    AND public.can_edit_proposal(auth.uid(), p.id)
  )
);

CREATE POLICY "Users can delete equipment items for editable proposals"
ON public.budget_equipment_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.budget_rows br
    JOIN public.proposals p ON p.id = br.proposal_id
    WHERE br.id = budget_equipment_items.budget_row_id
    AND public.can_edit_proposal(auth.uid(), p.id)
  )
);