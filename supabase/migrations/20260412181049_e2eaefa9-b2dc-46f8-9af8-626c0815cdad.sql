ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS case_include_number boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS case_include_abbreviation boolean NOT NULL DEFAULT true;