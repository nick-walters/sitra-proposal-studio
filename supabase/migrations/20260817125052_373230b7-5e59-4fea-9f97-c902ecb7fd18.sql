ALTER TABLE public.proposal_cards DISABLE TRIGGER USER;

UPDATE public.card_templates SET anchor = 'free', order_index = 102, updated_at = now()
WHERE key = 'b12.linked_activities';
UPDATE public.card_templates SET order_index = 103 WHERE key = 'b12.interdisciplinarity';
UPDATE public.card_templates SET order_index = 104 WHERE key = 'b12.ssh';
UPDATE public.card_templates SET order_index = 105 WHERE key = 'b12.gender';
UPDATE public.card_templates SET order_index = 106 WHERE key = 'b12.open_science';

WITH targets AS (
  SELECT DISTINCT section_id FROM public.proposal_cards WHERE template_key = 'b12.linked_activities'
)
UPDATE public.proposal_cards c
SET order_index = c.order_index + 500
WHERE c.section_id IN (SELECT section_id FROM targets)
  AND c.anchor = 'free';

WITH targets AS (
  SELECT DISTINCT section_id FROM public.proposal_cards WHERE template_key = 'b12.linked_activities'
), ranked AS (
  SELECT c.id,
         CASE
           WHEN c.template_key = 'b12.concepts' THEN 100
           WHEN c.template_key = 'b12.methodologies' THEN 101
           WHEN c.template_key = 'b12.linked_activities' THEN 102
           WHEN c.template_key = 'b12.interdisciplinarity' THEN 103
           WHEN c.template_key = 'b12.ssh' THEN 104
           WHEN c.template_key = 'b12.gender' THEN 105
           WHEN c.template_key = 'b12.open_science' THEN 106
           ELSE 106 + row_number() OVER (PARTITION BY c.section_id ORDER BY c.order_index)
         END AS new_index
  FROM public.proposal_cards c
  WHERE c.section_id IN (SELECT section_id FROM targets)
    AND (c.anchor = 'free' OR c.template_key = 'b12.linked_activities')
)
UPDATE public.proposal_cards c
SET anchor = 'free', order_index = r.new_index
FROM ranked r
WHERE c.id = r.id;

ALTER TABLE public.proposal_cards ENABLE TRIGGER USER;
