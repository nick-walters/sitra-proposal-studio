
-- Add task_id to b31_deliverables for task-level association
ALTER TABLE public.b31_deliverables
ADD COLUMN task_id UUID REFERENCES public.wp_draft_tasks(id) ON DELETE SET NULL;

CREATE INDEX idx_b31_deliverables_task_id ON public.b31_deliverables(task_id);
