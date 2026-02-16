
-- Add task_id column to wp_draft_deliverables for task-level association
ALTER TABLE public.wp_draft_deliverables
ADD COLUMN task_id UUID REFERENCES public.wp_draft_tasks(id) ON DELETE SET NULL;

-- Index for faster lookups
CREATE INDEX idx_wp_draft_deliverables_task_id ON public.wp_draft_deliverables(task_id);
