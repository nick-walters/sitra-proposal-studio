-- Update titles to sentence case (only first word capitalized)

UPDATE template_sections SET title = 'Proposal summary' WHERE id = 'a0000001-0000-0000-0000-000000000001';
UPDATE template_sections SET title = 'Budget overview' WHERE id = 'a0000003-0000-0000-0000-000000000003';
UPDATE template_sections SET title = 'Objectives & ambition' WHERE id = 'b0000002-0000-0000-0000-000000000002';
UPDATE template_sections SET title = 'Project''s pathways towards impact' WHERE id = 'b0000005-0000-0000-0000-000000000005';