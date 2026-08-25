INSERT INTO public.card_templates (
  template_type_id, template_version_id, section_source_id, section_number, document,
  key, kind, default_title, anchor, order_index,
  is_deletable, is_hideable, is_source_fed, is_fixed_position, default_visible,
  source_key, title_mode, is_active
)
SELECT DISTINCT ON (ct.template_version_id)
  ct.template_type_id, ct.template_version_id, ct.section_source_id, ct.section_number, ct.document,
  'b11.participants', 'text', 'List of participants', 'head', 90,
  false, true, true, true, true,
  'b11.participants', 'mirrored', true
FROM public.card_templates ct
WHERE ct.section_number ILIKE 'B1.1%'
  AND NOT EXISTS (
    SELECT 1 FROM public.card_templates x
    WHERE x.key = 'b11.participants'
      AND x.template_version_id IS NOT DISTINCT FROM ct.template_version_id
  )
ORDER BY ct.template_version_id, ct.order_index;

INSERT INTO public.proposal_cards (
  proposal_id, section_id, document, kind, template_key, title, order_index, anchor,
  is_deletable, is_hideable, is_source_fed, is_fixed_position, is_visible,
  source_key, origin, title_mode
)
SELECT DISTINCT ON (pc.proposal_id, pc.section_id)
  pc.proposal_id, pc.section_id, pc.document, 'text', 'b11.participants', 'List of participants', 90, 'head',
  false, true, true, true, true,
  'b11.participants', 'auto', 'mirrored'
FROM public.proposal_cards pc
WHERE pc.template_key LIKE 'b11.%'
  AND pc.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.proposal_cards y
    WHERE y.proposal_id = pc.proposal_id
      AND y.section_id = pc.section_id
      AND y.template_key = 'b11.participants'
  )
ORDER BY pc.proposal_id, pc.section_id, pc.order_index;