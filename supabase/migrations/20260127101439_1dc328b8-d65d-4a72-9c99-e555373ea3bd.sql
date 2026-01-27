
-- Remove scoring guidelines from parent sections (B1, B2) since they're not directly accessible
DELETE FROM section_guidelines 
WHERE section_id IN ('00000000-0003-0001-0000-000000000001', '00000000-0003-0002-0000-000000000001')
  AND guideline_type = 'evaluation'
  AND content LIKE 'The maximum score for the entire Part B%';

-- Add scoring info directly to B1.1 (Objectives & ambition)
INSERT INTO section_guidelines (id, section_id, guideline_type, title, content, order_index, is_active)
VALUES (
  gen_random_uuid(),
  '00000000-0003-0001-0001-000000000001',
  'evaluation',
  '',
  'The maximum score for the entire Part B1 is 5 points. The minimum threshold for Part B1 is 4/5 and for the proposal as a whole 8/10. This is a general rule, but the topic may state special circumstances.',
  200,
  true
);

-- Add scoring info directly to B1.2 (Methodology)
INSERT INTO section_guidelines (id, section_id, guideline_type, title, content, order_index, is_active)
VALUES (
  gen_random_uuid(),
  '00000000-0003-0001-0002-000000000001',
  'evaluation',
  '',
  'The maximum score for the entire Part B1 is 5 points. The minimum threshold for Part B1 is 4/5 and for the proposal as a whole 8/10. This is a general rule, but the topic may state special circumstances.',
  200,
  true
);

-- Add scoring info directly to B2.1 (Project's pathways towards impact)
INSERT INTO section_guidelines (id, section_id, guideline_type, title, content, order_index, is_active)
VALUES (
  gen_random_uuid(),
  '00000000-0003-0002-0001-000000000001',
  'evaluation',
  '',
  'The maximum score for the entire Part B2 is 5 points. The minimum threshold for Part B2 is 4/5 and for the proposal as a whole 8/10. This is a general rule, but the topic may state special circumstances.',
  200,
  true
);