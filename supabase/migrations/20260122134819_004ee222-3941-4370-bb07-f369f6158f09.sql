-- Add organisation_category column to participants table
-- This stores the socio-economic type: RES, UNI, IND, SME, NGO, CSO, PUB, INT
ALTER TABLE public.participants 
ADD COLUMN IF NOT EXISTS organisation_category TEXT;

-- Add english_name column for alternative name display
ALTER TABLE public.participants 
ADD COLUMN IF NOT EXISTS english_name TEXT;

-- Add comment explaining the category values
COMMENT ON COLUMN public.participants.organisation_category IS 'Socio-economic organisation type: RES (Research), UNI (University), IND (Large Enterprise), SME (Small/Medium Enterprise), NGO (Non-Governmental), CSO (Civil Society), PUB (Public), INT (International), OTH (Other)';
COMMENT ON COLUMN public.participants.english_name IS 'English name of the organisation if different from the official PIC name';