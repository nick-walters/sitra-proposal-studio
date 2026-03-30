
-- Create WP-level effort table
CREATE TABLE public.wp_draft_effort (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wp_draft_id UUID NOT NULL REFERENCES public.wp_drafts(id) ON DELETE CASCADE,
  participant_id UUID NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  person_months NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(wp_draft_id, participant_id)
);

-- Add pm_rate to budget_rows
ALTER TABLE public.budget_rows ADD COLUMN pm_rate NUMERIC DEFAULT NULL;

-- Enable RLS
ALTER TABLE public.wp_draft_effort ENABLE ROW LEVEL SECURITY;

-- RLS policies for wp_draft_effort
CREATE POLICY "Users can view effort for proposals they have access to"
  ON public.wp_draft_effort FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wp_drafts wd
      JOIN public.proposals p ON p.id = wd.proposal_id
      WHERE wd.id = wp_draft_effort.wp_draft_id
        AND public.has_any_proposal_role(auth.uid(), p.id)
    )
  );

CREATE POLICY "Editors can insert effort"
  ON public.wp_draft_effort FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.wp_drafts wd
      JOIN public.proposals p ON p.id = wd.proposal_id
      WHERE wd.id = wp_draft_effort.wp_draft_id
        AND public.can_edit_proposal(auth.uid(), p.id)
    )
  );

CREATE POLICY "Editors can update effort"
  ON public.wp_draft_effort FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wp_drafts wd
      JOIN public.proposals p ON p.id = wd.proposal_id
      WHERE wd.id = wp_draft_effort.wp_draft_id
        AND public.can_edit_proposal(auth.uid(), p.id)
    )
  );

CREATE POLICY "Editors can delete effort"
  ON public.wp_draft_effort FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.wp_drafts wd
      JOIN public.proposals p ON p.id = wd.proposal_id
      WHERE wd.id = wp_draft_effort.wp_draft_id
        AND public.can_edit_proposal(auth.uid(), p.id)
    )
  );

-- Migrate existing task-level effort to WP-level by aggregating
INSERT INTO public.wp_draft_effort (wp_draft_id, participant_id, person_months)
SELECT t.wp_draft_id, e.participant_id, SUM(e.person_months)
FROM public.wp_draft_task_effort e
JOIN public.wp_draft_tasks t ON t.id = e.task_id
GROUP BY t.wp_draft_id, e.participant_id
ON CONFLICT (wp_draft_id, participant_id) DO NOTHING;

-- Add updated_at trigger
CREATE TRIGGER update_wp_draft_effort_updated_at
  BEFORE UPDATE ON public.wp_draft_effort
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
