-- Add section_tag column to template_sections for PDF export tags
ALTER TABLE public.template_sections 
ADD COLUMN IF NOT EXISTS section_tag text DEFAULT NULL;

-- Add comment explaining purpose
COMMENT ON COLUMN public.template_sections.section_tag IS 'Official HE application form tag for PDF export (e.g., [#Objectives], [#Ambition])';

-- Update existing RIA Stage 1 sections with official tags
UPDATE public.template_sections 
SET section_tag = '[#Excellence]'
WHERE id = 'b0000001-0000-0000-0000-000000000001';

UPDATE public.template_sections 
SET section_tag = '[#Objectives] [#Ambition]'
WHERE id = 'b0000002-0000-0000-0000-000000000002';

UPDATE public.template_sections 
SET section_tag = '[#Methodology]'
WHERE id = 'b0000003-0000-0000-0000-000000000003';

UPDATE public.template_sections 
SET section_tag = '[#Impact]'
WHERE id = 'b0000004-0000-0000-0000-000000000004';

UPDATE public.template_sections 
SET section_tag = '[#Outcomes] [#Impacts]'
WHERE id = 'b0000005-0000-0000-0000-000000000005';

UPDATE public.template_sections 
SET section_tag = '[#Quality] [#Efficiency]'
WHERE id = 'b0000006-0000-0000-0000-000000000006';