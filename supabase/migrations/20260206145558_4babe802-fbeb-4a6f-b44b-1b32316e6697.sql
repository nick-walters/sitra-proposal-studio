-- Add ethics confirmation checkbox field
ALTER TABLE public.ethics_assessment 
ADD COLUMN IF NOT EXISTS ethics_confirmation boolean DEFAULT false;