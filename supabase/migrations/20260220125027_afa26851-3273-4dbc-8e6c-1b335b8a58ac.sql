
CREATE TABLE public.pinned_proposals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, proposal_id)
);

ALTER TABLE public.pinned_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own pins"
  ON public.pinned_proposals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own pins"
  ON public.pinned_proposals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own pins"
  ON public.pinned_proposals FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own pins"
  ON public.pinned_proposals FOR UPDATE
  USING (auth.uid() = user_id);
