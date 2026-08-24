-- 3a. Remove the legacy 'evaluation' guideline category
DELETE FROM public.proposal_section_guidelines WHERE guideline_type = 'evaluation';
DELETE FROM public.section_guidelines WHERE guideline_type = 'evaluation';

-- 3b. Second criteria entry per subsection: scoring information
INSERT INTO public.card_guidelines (id, guideline_type, title, content, order_index, is_active)
SELECT gen_random_uuid(), 'criteria', NULL,
'<p>Scores are awarded on a scale of 0 to 5, in half-point increments.</p>
<ul>
<li><strong>0</strong> — Fails to address the criterion, or cannot be assessed due to missing or incomplete information.</li>
<li><strong>1 — Poor</strong>: the criterion is inadequately addressed, or there are serious inherent weaknesses.</li>
<li><strong>2 — Fair</strong>: the proposal broadly addresses the criterion, but with significant weaknesses.</li>
<li><strong>3 — Good</strong>: the proposal addresses the criterion well, but a number of shortcomings are present.</li>
<li><strong>4 — Very good</strong>: the proposal addresses the criterion very well, but a small number of shortcomings are present.</li>
<li><strong>5 — Excellent</strong>: the proposal successfully addresses all relevant aspects of the criterion; any shortcomings are minor.</li>
</ul>
<p>The threshold for this criterion is 3 out of 5. The overall threshold, applying to the sum of the three criteria, is 10 out of 15. Some topics apply specific weighting variations.</p>',
 1, true
FROM public.card_guideline_sections s
JOIN public.card_guidelines g ON g.id = s.guideline_id AND g.guideline_type = 'criteria';

-- link each new scoring row to the section whose criterion it accompanies
WITH new_rows AS (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM public.card_guidelines
  WHERE guideline_type = 'criteria' AND order_index = 1
), targets AS (
  SELECT s.section_source_id, row_number() OVER (ORDER BY s.section_source_id) AS rn
  FROM public.card_guideline_sections s
  JOIN public.card_guidelines g ON g.id = s.guideline_id AND g.guideline_type = 'criteria' AND g.order_index = 0
)
INSERT INTO public.card_guideline_sections (guideline_id, section_source_id)
SELECT n.id, t.section_source_id FROM new_rows n JOIN targets t USING (rn);