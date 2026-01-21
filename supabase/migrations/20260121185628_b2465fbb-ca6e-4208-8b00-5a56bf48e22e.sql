-- Update section numbers to remove dots between letter and first number (B.1.1 -> B1.1)
-- Update titles to use ampersand instead of "and"

UPDATE template_sections SET section_number = 'A0' WHERE id = 'a0000001-0000-0000-0000-000000000001';
UPDATE template_sections SET section_number = 'A1' WHERE id = 'a0000002-0000-0000-0000-000000000002';
UPDATE template_sections SET section_number = 'A2' WHERE id = 'a0000003-0000-0000-0000-000000000003';

UPDATE template_sections SET section_number = 'B1' WHERE id = 'b0000001-0000-0000-0000-000000000001';
UPDATE template_sections SET section_number = 'B1.1', title = 'Objectives & Ambition' WHERE id = 'b0000002-0000-0000-0000-000000000002';
UPDATE template_sections SET section_number = 'B1.2' WHERE id = 'b0000003-0000-0000-0000-000000000003';
UPDATE template_sections SET section_number = 'B2' WHERE id = 'b0000004-0000-0000-0000-000000000004';
UPDATE template_sections SET section_number = 'B2.1' WHERE id = 'b0000005-0000-0000-0000-000000000005';