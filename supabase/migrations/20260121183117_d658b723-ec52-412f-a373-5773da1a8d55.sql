-- Fix RIA Stage 1 template sections to match official Horizon Europe Stage 1 form

-- Update B.2.1 title to official wording
UPDATE template_sections 
SET title = 'Project''s Pathways towards Impact',
    section_tag = '[#PathwaysToImpact]'
WHERE id = 'b0000005-0000-0000-0000-000000000005';

-- Delete B.3 section (not part of Stage 1 template)
-- First delete any guidelines associated with B.3
DELETE FROM section_guidelines 
WHERE section_id = 'b0000006-0000-0000-0000-000000000006';

-- Delete any form fields associated with B.3
DELETE FROM template_form_fields 
WHERE section_id = 'b0000006-0000-0000-0000-000000000006';

-- Delete B.3 section itself
DELETE FROM template_sections 
WHERE id = 'b0000006-0000-0000-0000-000000000006';