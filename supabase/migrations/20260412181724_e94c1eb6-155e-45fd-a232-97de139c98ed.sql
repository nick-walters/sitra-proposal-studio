ALTER TABLE public.wp_drafts ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;
ALTER TABLE public.case_drafts ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;