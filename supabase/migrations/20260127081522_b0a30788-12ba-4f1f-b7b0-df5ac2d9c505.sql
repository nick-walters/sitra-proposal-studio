-- Add english_name column to organisations table for the centralized registry
ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS english_name text;

-- Add index on pic_number for faster lookups
CREATE INDEX IF NOT EXISTS idx_organisations_pic_number ON public.organisations(pic_number);