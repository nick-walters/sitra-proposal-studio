-- Add columns to store imported topic description and destination text
ALTER TABLE public.proposals 
ADD COLUMN IF NOT EXISTS topic_description TEXT,
ADD COLUMN IF NOT EXISTS topic_destination_description TEXT,
ADD COLUMN IF NOT EXISTS topic_content_imported_at TIMESTAMP WITH TIME ZONE;