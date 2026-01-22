-- Add expected_projects field to proposals table for tracking number of projects expected to be funded
ALTER TABLE public.proposals 
ADD COLUMN expected_projects text;