
CREATE TABLE public.table_column_widths (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  table_key TEXT NOT NULL,
  column_widths JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID,
  UNIQUE(proposal_id, table_key)
);

ALTER TABLE public.table_column_widths ENABLE ROW LEVEL SECURITY;

-- Anyone on the proposal can read column widths
CREATE POLICY "Users can view column widths for their proposals"
ON public.table_column_widths
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND (ur.proposal_id = table_column_widths.proposal_id OR ur.proposal_id IS NULL)
  )
);

-- Only coordinators, admins, owners can insert/update
CREATE POLICY "Coordinators can insert column widths"
ON public.table_column_widths
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND (
      (ur.proposal_id IS NULL AND ur.role IN ('owner', 'admin'))
      OR (ur.proposal_id = table_column_widths.proposal_id AND ur.role = 'coordinator')
    )
  )
);

CREATE POLICY "Coordinators can update column widths"
ON public.table_column_widths
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND (
      (ur.proposal_id IS NULL AND ur.role IN ('owner', 'admin'))
      OR (ur.proposal_id = table_column_widths.proposal_id AND ur.role = 'coordinator')
    )
  )
);
