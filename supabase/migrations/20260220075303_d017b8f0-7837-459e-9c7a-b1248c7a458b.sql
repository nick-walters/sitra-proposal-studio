
-- Add opening_date column to proposals
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS opening_date TIMESTAMPTZ;
