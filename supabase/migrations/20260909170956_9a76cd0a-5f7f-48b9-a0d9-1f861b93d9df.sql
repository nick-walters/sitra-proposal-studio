UPDATE public.card_templates
SET section_number = 'B2.2',
    section_source_id = '00000000-0003-0002-0002-000000000002',
    order_index = 102,
    updated_at = now()
WHERE key = 'b21.impact_summary';

UPDATE public.proposal_cards c
SET section_id = tgt.id,
    order_index = 102,
    anchor = 'free',
    updated_at = now()
FROM public.proposal_template_sections tgt
JOIN public.proposal_templates pt ON pt.id = tgt.proposal_template_id
WHERE c.template_key = 'b21.impact_summary'
  AND pt.proposal_id = c.proposal_id
  AND upper(replace(tgt.section_number, 'B', '')) = '2.2';