
-- Add requested EU contribution override (editable field, null = use max)
ALTER TABLE public.budget_rows ADD COLUMN IF NOT EXISTS requested_eu_contribution NUMERIC DEFAULT NULL;
