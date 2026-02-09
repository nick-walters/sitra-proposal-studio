-- Add new security fields to ethics_assessment table
ALTER TABLE public.ethics_assessment
ADD COLUMN IF NOT EXISTS security_euci_background boolean DEFAULT null,
ADD COLUMN IF NOT EXISTS security_euci_background_page text,
ADD COLUMN IF NOT EXISTS security_euci_foreground boolean DEFAULT null,
ADD COLUMN IF NOT EXISTS security_euci_foreground_page text,
ADD COLUMN IF NOT EXISTS security_misuse_crime_terrorism boolean DEFAULT null,
ADD COLUMN IF NOT EXISTS security_misuse_crime_terrorism_page text,
ADD COLUMN IF NOT EXISTS security_misuse_cbrn boolean DEFAULT null,
ADD COLUMN IF NOT EXISTS security_misuse_cbrn_page text,
ADD COLUMN IF NOT EXISTS security_other_national boolean DEFAULT null,
ADD COLUMN IF NOT EXISTS security_other_national_page text,
ADD COLUMN IF NOT EXISTS security_other_national_details text;