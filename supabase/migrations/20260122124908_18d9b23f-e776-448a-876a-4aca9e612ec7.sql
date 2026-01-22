-- Add duration and topic_title columns to proposals table
ALTER TABLE public.proposals 
ADD COLUMN IF NOT EXISTS duration integer,
ADD COLUMN IF NOT EXISTS topic_title text;