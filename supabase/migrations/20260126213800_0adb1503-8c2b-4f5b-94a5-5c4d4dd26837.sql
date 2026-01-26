-- Add uses_fstp column to proposals table for Financial Support to Third Parties
ALTER TABLE public.proposals 
ADD COLUMN IF NOT EXISTS uses_fstp boolean NOT NULL DEFAULT false;