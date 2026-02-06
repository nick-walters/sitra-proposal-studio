-- Add security issues and self-assessment fields to ethics_assessment table
ALTER TABLE public.ethics_assessment
ADD COLUMN IF NOT EXISTS security_eu_classified boolean,
ADD COLUMN IF NOT EXISTS security_eu_classified_page text,
ADD COLUMN IF NOT EXISTS security_eu_classified_level text,
ADD COLUMN IF NOT EXISTS security_dual_use boolean,
ADD COLUMN IF NOT EXISTS security_dual_use_page text,
ADD COLUMN IF NOT EXISTS security_misuse boolean,
ADD COLUMN IF NOT EXISTS security_misuse_page text,
ADD COLUMN IF NOT EXISTS security_exclusively_defence boolean,
ADD COLUMN IF NOT EXISTS security_exclusively_defence_page text,
ADD COLUMN IF NOT EXISTS self_assessment_text text;