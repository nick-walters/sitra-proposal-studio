
ALTER TABLE public.b31_milestones
ADD COLUMN task_id UUID REFERENCES public.wp_draft_tasks(id) ON DELETE SET NULL;

CREATE INDEX idx_b31_milestones_task_id ON public.b31_milestones(task_id);
