ALTER TABLE public.wp_drafts
  ADD COLUMN IF NOT EXISTS background_knowledge text,
  ADD COLUMN IF NOT EXISTS approach_summary text,
  ADD COLUMN IF NOT EXISTS methodologies_list jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS foreseen_challenges text;