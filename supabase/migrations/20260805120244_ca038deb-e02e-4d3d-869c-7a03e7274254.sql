ALTER TABLE public.part_a1
  ADD COLUMN IF NOT EXISTS ai_statement_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_statement_text text;