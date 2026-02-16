
-- Add content fields for the four case subsections
ALTER TABLE public.case_drafts 
  ADD COLUMN IF NOT EXISTS background_context TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS proposed_solutions TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS expected_outcomes TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS replicability TEXT DEFAULT '';

-- Add editable heading labels (coordinator can rename)
ALTER TABLE public.case_drafts
  ADD COLUMN IF NOT EXISTS heading_background TEXT DEFAULT 'Background context',
  ADD COLUMN IF NOT EXISTS heading_solutions TEXT DEFAULT 'Proposed solutions',
  ADD COLUMN IF NOT EXISTS heading_outcomes TEXT DEFAULT 'Expected outcomes',
  ADD COLUMN IF NOT EXISTS heading_replicability TEXT DEFAULT 'Replicability';
