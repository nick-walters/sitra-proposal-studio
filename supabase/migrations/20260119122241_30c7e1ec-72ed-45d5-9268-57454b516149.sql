-- Create budget change history table for tracked changes
CREATE TABLE public.budget_changes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_item_id UUID REFERENCES public.budget_items(id) ON DELETE CASCADE,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('create', 'update', 'delete')),
  field_changed TEXT,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.budget_changes ENABLE ROW LEVEL SECURITY;

-- Users can view budget changes for proposals they have access to
CREATE POLICY "Users can view budget changes"
ON public.budget_changes
FOR SELECT
USING (has_any_proposal_role(auth.uid(), proposal_id));

-- Editors and admins can create budget changes
CREATE POLICY "Editors can create budget changes"
ON public.budget_changes
FOR INSERT
WITH CHECK (can_edit_proposal(auth.uid(), proposal_id));

-- Add person_months and unit_cost columns to budget_items for detailed tracking
ALTER TABLE public.budget_items 
ADD COLUMN IF NOT EXISTS person_months NUMERIC,
ADD COLUMN IF NOT EXISTS unit_cost NUMERIC,
ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS cost_type TEXT DEFAULT 'actual' CHECK (cost_type IN ('actual', 'unit', 'flat_rate'));

-- Create index for faster queries
CREATE INDEX idx_budget_changes_proposal ON public.budget_changes(proposal_id);
CREATE INDEX idx_budget_changes_item ON public.budget_changes(budget_item_id);