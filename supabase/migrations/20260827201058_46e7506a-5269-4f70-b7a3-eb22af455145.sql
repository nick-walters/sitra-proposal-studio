ALTER TABLE public.wp_draft_tasks ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;
ALTER TABLE public.wp_drafts ADD COLUMN IF NOT EXISTS intro_visible boolean NOT NULL DEFAULT true;