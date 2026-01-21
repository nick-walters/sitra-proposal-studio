-- Add submission_stage column to proposals table
-- Values: 'full' (default) or 'stage_1'
ALTER TABLE public.proposals 
ADD COLUMN submission_stage TEXT DEFAULT 'full' CHECK (submission_stage IN ('full', 'stage_1'));