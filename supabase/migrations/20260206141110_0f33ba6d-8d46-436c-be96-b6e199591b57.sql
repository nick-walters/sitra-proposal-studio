-- Add separate ethics and security self-assessment text fields
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS ethics_self_assessment_objectives TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS ethics_self_assessment_compliance TEXT;
ALTER TABLE public.ethics_assessment ADD COLUMN IF NOT EXISTS security_self_assessment TEXT;