-- Add field to track if full proposal is second stage of two-stage submission
ALTER TABLE proposals 
ADD COLUMN IF NOT EXISTS is_two_stage_second_stage boolean DEFAULT false;