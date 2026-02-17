
CREATE TABLE public.table_captions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  table_key TEXT NOT NULL,
  caption TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID,
  UNIQUE (proposal_id, table_key)
);

ALTER TABLE public.table_captions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view captions for their proposals"
ON public.table_captions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND (ur.proposal_id = table_captions.proposal_id OR ur.proposal_id IS NULL)
  )
);

CREATE POLICY "Coordinators can update captions"
ON public.table_captions
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND (
      (ur.proposal_id IS NULL AND ur.role IN ('owner', 'admin'))
      OR (ur.proposal_id = table_captions.proposal_id AND ur.role = 'coordinator')
    )
  )
);

CREATE POLICY "Coordinators can insert captions"
ON public.table_captions
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND (
      (ur.proposal_id IS NULL AND ur.role IN ('owner', 'admin'))
      OR (ur.proposal_id = table_captions.proposal_id AND ur.role = 'coordinator')
    )
  )
);
