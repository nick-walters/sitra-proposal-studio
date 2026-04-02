ALTER TABLE public.proposals ADD COLUMN wp_drafts_visible boolean NOT NULL DEFAULT true;
ALTER TABLE public.proposals ADD COLUMN case_drafts_visible boolean NOT NULL DEFAULT true;