
-- Add scoring information to evaluation criteria for B1 (Excellence) - Stage 1 pre-proposal
INSERT INTO section_guidelines (
  id,
  section_id,
  guideline_type,
  title,
  content,
  order_index,
  is_active
) VALUES (
  gen_random_uuid(),
  '00000000-0003-0001-0000-000000000001', -- B1 section in Stage 1 template
  'evaluation',
  '',
  'The maximum score for the entire Part B1 is 5 points. The minimum threshold for Part B1 is 4/5 and for the proposal as a whole 8/10. This is a general rule, but the topic may state special circumstances.',
  100, -- High order_index to appear after other evaluation content
  true
);

-- Add scoring information to evaluation criteria for B2 (Impact) - Stage 1 pre-proposal
INSERT INTO section_guidelines (
  id,
  section_id,
  guideline_type,
  title,
  content,
  order_index,
  is_active
) VALUES (
  gen_random_uuid(),
  '00000000-0003-0002-0000-000000000001', -- B2 section in Stage 1 template
  'evaluation',
  '',
  'The maximum score for the entire Part B2 is 5 points. The minimum threshold for Part B2 is 4/5 and for the proposal as a whole 8/10. This is a general rule, but the topic may state special circumstances.',
  100,
  true
);