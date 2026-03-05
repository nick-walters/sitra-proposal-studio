ALTER TABLE public.case_drafts
  ADD COLUMN IF NOT EXISTS key_stakeholders text,
  ADD COLUMN IF NOT EXISTS heading_stakeholders text,
  ADD COLUMN IF NOT EXISTS guideline_stakeholders text;