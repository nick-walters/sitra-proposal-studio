-- Fix A4 and A5 parent section assignment
-- These sections were inserted without parent_section_id, causing them to render as top-level sections
UPDATE template_sections 
SET parent_section_id = '00000000-0002-0000-0000-000000000002'
WHERE section_number IN ('A4', 'A5') 
AND template_type_id = '33333333-3333-3333-3333-333333333333';