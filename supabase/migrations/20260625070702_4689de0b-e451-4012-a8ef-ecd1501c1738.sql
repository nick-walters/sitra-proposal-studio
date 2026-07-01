CREATE TABLE public.wp_draft_deliverable_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id uuid NOT NULL REFERENCES public.wp_draft_deliverables(id) ON DELETE CASCADE,
  wp_draft_task_id uuid NOT NULL REFERENCES public.wp_draft_tasks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deliverable_id, wp_draft_task_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wp_draft_deliverable_tasks TO authenticated;
GRANT ALL ON public.wp_draft_deliverable_tasks TO service_role;

ALTER TABLE public.wp_draft_deliverable_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Deliverable tasks viewable by proposal members" ON public.wp_draft_deliverable_tasks
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.wp_draft_deliverables d
    JOIN public.wp_drafts wd ON wd.id = d.wp_draft_id
    WHERE d.id = wp_draft_deliverable_tasks.deliverable_id
      AND has_any_proposal_role(auth.uid(), wd.proposal_id)
  ));

CREATE POLICY "Deliverable tasks insertable by editors" ON public.wp_draft_deliverable_tasks
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.wp_draft_deliverables d
    JOIN public.wp_drafts wd ON wd.id = d.wp_draft_id
    WHERE d.id = wp_draft_deliverable_tasks.deliverable_id
      AND can_edit_proposal(auth.uid(), wd.proposal_id)
  ));

CREATE POLICY "Deliverable tasks updatable by editors" ON public.wp_draft_deliverable_tasks
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.wp_draft_deliverables d
    JOIN public.wp_drafts wd ON wd.id = d.wp_draft_id
    WHERE d.id = wp_draft_deliverable_tasks.deliverable_id
      AND can_edit_proposal(auth.uid(), wd.proposal_id)
  ));

CREATE POLICY "Deliverable tasks deletable by editors" ON public.wp_draft_deliverable_tasks
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.wp_draft_deliverables d
    JOIN public.wp_drafts wd ON wd.id = d.wp_draft_id
    WHERE d.id = wp_draft_deliverable_tasks.deliverable_id
      AND can_edit_proposal(auth.uid(), wd.proposal_id)
  ));

CREATE INDEX wp_draft_deliverable_tasks_deliverable_idx ON public.wp_draft_deliverable_tasks(deliverable_id);
CREATE INDEX wp_draft_deliverable_tasks_task_idx ON public.wp_draft_deliverable_tasks(wp_draft_task_id);