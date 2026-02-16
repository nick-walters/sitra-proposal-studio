
-- Add reporting_periods JSON column to proposals table
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS reporting_periods JSONB DEFAULT NULL;
