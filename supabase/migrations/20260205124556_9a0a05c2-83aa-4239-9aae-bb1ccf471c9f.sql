
-- Create Full RIA/IA template type
INSERT INTO template_types (
  id, funding_programme_id, code, name, description,
  submission_stage, base_page_limit, includes_branding, includes_participant_table,
  action_types, is_active
) VALUES (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'HE_RIA_IA_FULL',
  'RIA/IA Full Proposal',
  'Full proposal template for Horizon Europe RIA and IA actions',
  'full',
  45,
  true,
  true,
  ARRAY['RIA', 'IA'],
  true
);

-- Create Part A sections for Full template (using 'summary' for containers)
INSERT INTO template_sections (id, template_type_id, part, section_number, title, editor_type, order_index, is_required, is_active) VALUES
('00000000-0002-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'A', 'Part A', 'Part A: Administrative forms', 'summary', 0, true, true),
('00000000-0002-0001-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'A', 'A1', 'General information', 'form', 1, true, true),
('00000000-0002-0002-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'A', 'A2', 'Participants', 'form', 2, true, true),
('00000000-0002-0003-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'A', 'A3', 'Budget', 'form', 3, true, true);

-- Set parent for Part A subsections
UPDATE template_sections SET parent_section_id = '00000000-0002-0000-0000-000000000002' 
WHERE id IN ('00000000-0002-0001-0000-000000000002', '00000000-0002-0002-0000-000000000002', '00000000-0002-0003-0000-000000000002');

-- Create Part B sections for Full template (B1, B2, B3)
INSERT INTO template_sections (id, template_type_id, part, section_number, title, editor_type, order_index, is_required, is_active) VALUES
-- Part B container
('00000000-0003-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'B', 'Part B', 'Part B: Technical description', 'summary', 10, true, true),

-- B1 Excellence
('00000000-0003-0001-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'B', 'B1', 'Excellence', 'summary', 11, true, true),
('00000000-0003-0001-0001-000000000002', '33333333-3333-3333-3333-333333333333', 'B', 'B1.1', 'Objectives and ambition', 'rich_text', 12, true, true),
('00000000-0003-0001-0002-000000000002', '33333333-3333-3333-3333-333333333333', 'B', 'B1.2', 'Methodology', 'rich_text', 13, true, true),

-- B2 Impact
('00000000-0003-0002-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'B', 'B2', 'Impact', 'summary', 20, true, true),
('00000000-0003-0002-0001-000000000002', '33333333-3333-3333-3333-333333333333', 'B', 'B2.1', 'Project''s pathways towards impact', 'rich_text', 21, true, true),
('00000000-0003-0002-0002-000000000002', '33333333-3333-3333-3333-333333333333', 'B', 'B2.2', 'Measures to maximise impact', 'rich_text', 22, true, true),
('00000000-0003-0002-0003-000000000002', '33333333-3333-3333-3333-333333333333', 'B', 'B2.3', 'Summary', 'rich_text', 23, false, true),

-- B3 Implementation
('00000000-0003-0003-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'B', 'B3', 'Quality and efficiency of implementation', 'summary', 30, true, true),
('00000000-0003-0003-0001-000000000002', '33333333-3333-3333-3333-333333333333', 'B', 'B3.1', 'Work plan and resources', 'rich_text', 31, true, true),
('00000000-0003-0003-0002-000000000002', '33333333-3333-3333-3333-333333333333', 'B', 'B3.2', 'Capacity of participants and consortium', 'rich_text', 32, true, true);

-- Set parent relationships for Part B
UPDATE template_sections SET parent_section_id = '00000000-0003-0000-0000-000000000002' 
WHERE id IN ('00000000-0003-0001-0000-000000000002', '00000000-0003-0002-0000-000000000002', '00000000-0003-0003-0000-000000000002');

-- B1 subsections
UPDATE template_sections SET parent_section_id = '00000000-0003-0001-0000-000000000002' 
WHERE id IN ('00000000-0003-0001-0001-000000000002', '00000000-0003-0001-0002-000000000002');

-- B2 subsections
UPDATE template_sections SET parent_section_id = '00000000-0003-0002-0000-000000000002' 
WHERE id IN ('00000000-0003-0002-0001-000000000002', '00000000-0003-0002-0002-000000000002', '00000000-0003-0002-0003-000000000002');

-- B3 subsections
UPDATE template_sections SET parent_section_id = '00000000-0003-0003-0000-000000000002' 
WHERE id IN ('00000000-0003-0003-0001-000000000002', '00000000-0003-0003-0002-000000000002');

-- Link existing full proposals to the new template type
UPDATE proposals SET template_type_id = '33333333-3333-3333-3333-333333333333' 
WHERE submission_stage = 'full' AND template_type_id IS NULL;
