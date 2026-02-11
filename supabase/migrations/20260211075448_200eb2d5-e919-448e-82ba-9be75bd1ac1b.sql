
-- Create wp_draft_milestones table
CREATE TABLE public.wp_draft_milestones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wp_draft_id UUID NOT NULL REFERENCES public.wp_drafts(id) ON DELETE CASCADE,
  number INTEGER NOT NULL DEFAULT 1,
  title TEXT,
  related_wps TEXT,
  due_month INTEGER,
  means_of_verification TEXT,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.wp_draft_milestones ENABLE ROW LEVEL SECURITY;

-- RLS policies (matching wp_draft_risks pattern)
CREATE POLICY "Milestones viewable by proposal members"
ON public.wp_draft_milestones FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM wp_drafts wd
    WHERE wd.id = wp_draft_milestones.wp_draft_id
    AND has_any_proposal_role(auth.uid(), wd.proposal_id)
  )
);

CREATE POLICY "Milestones insertable by editors"
ON public.wp_draft_milestones FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM wp_drafts wd
    WHERE wd.id = wp_draft_milestones.wp_draft_id
    AND can_edit_proposal(auth.uid(), wd.proposal_id)
  )
);

CREATE POLICY "Milestones updatable by editors"
ON public.wp_draft_milestones FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM wp_drafts wd
    WHERE wd.id = wp_draft_milestones.wp_draft_id
    AND can_edit_proposal(auth.uid(), wd.proposal_id)
  )
);

CREATE POLICY "Milestones deletable by editors"
ON public.wp_draft_milestones FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM wp_drafts wd
    WHERE wd.id = wp_draft_milestones.wp_draft_id
    AND can_edit_proposal(auth.uid(), wd.proposal_id)
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_wp_draft_milestones_updated_at
BEFORE UPDATE ON public.wp_draft_milestones
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
