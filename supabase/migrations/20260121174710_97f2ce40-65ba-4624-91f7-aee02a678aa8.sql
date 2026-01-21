-- Update the check constraint to allow 'evaluation' type
ALTER TABLE public.section_guidelines DROP CONSTRAINT IF EXISTS section_guidelines_guideline_type_check;

ALTER TABLE public.section_guidelines 
ADD CONSTRAINT section_guidelines_guideline_type_check 
CHECK (guideline_type = ANY (ARRAY['official'::text, 'sitra_tip'::text, 'evaluation'::text]));