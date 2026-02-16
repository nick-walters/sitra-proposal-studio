ALTER TABLE public.case_drafts
  ADD COLUMN IF NOT EXISTS guideline_background TEXT,
  ADD COLUMN IF NOT EXISTS guideline_solutions TEXT,
  ADD COLUMN IF NOT EXISTS guideline_outcomes TEXT,
  ADD COLUMN IF NOT EXISTS guideline_replicability TEXT;