-- Impact Canvas Phase 1b: backfill figure rows for existing full-HE proposals,
-- and seed default columns for any proposal that doesn't yet have them.

-- Backfill columns for existing proposals that never triggered the seed function.
INSERT INTO public.impact_canvas_columns (proposal_id, key, heading, guideline, order_index)
SELECT p.id, v.key, v.heading, v.guideline, v.order_index
FROM public.proposals p
CROSS JOIN (VALUES
  ('needs',            'Specific needs',    'What are the specific needs that triggered this project?', 0),
  ('target_groups',    'Target groups',     'Who will use or further up-take the results of the project? Who will benefit from the results of the project?', 1),
  ('expected_results', 'Expected results',  'What do you expect to generate by the end of the project?', 2),
  ('dec_measures',     'DEC measures',      'What dissemination, exploitation and communication measures will you apply to the results?', 3),
  ('outcomes',         'Outcomes',          'What change do you expect to see after successful dissemination and exploitation of project results to the target group(s)?', 4),
  ('impacts',          'Impacts',           'What are the expected wider scientific, economic and societal effects of the project contributing to the expected impacts outlined in the respective destination in the work programme?', 5)
) AS v(key, heading, guideline, order_index)
WHERE NOT EXISTS (
  SELECT 1 FROM public.impact_canvas_columns c WHERE c.proposal_id = p.id
);

-- Backfill impact-canvas figure row for existing full-HE proposals.
INSERT INTO public.figures (proposal_id, figure_number, section_id, title, figure_type, content, order_index)
SELECT
  p.id,
  '2.1.z',
  '2.1',
  'Impact canvas',
  'impact-canvas',
  NULL,
  COALESCE((SELECT MAX(order_index) + 1 FROM public.figures WHERE proposal_id = p.id), 0)
FROM public.proposals p
WHERE p.submission_stage = 'full'
  AND NOT EXISTS (
    SELECT 1 FROM public.figures f
    WHERE f.proposal_id = p.id AND f.figure_type = 'impact-canvas'
  );
