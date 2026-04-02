
ALTER TABLE public.wp_drafts ADD COLUMN IF NOT EXISTS b31_objectives text;
ALTER TABLE public.wp_draft_tasks ADD COLUMN IF NOT EXISTS b31_description text;
