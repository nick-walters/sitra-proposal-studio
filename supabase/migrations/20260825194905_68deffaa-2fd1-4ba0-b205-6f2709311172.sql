-- 1. Template: shift the later B2.1 blocks and insert the new one at 102.
UPDATE public.card_templates
   SET order_index = order_index + 1, updated_at = now()
 WHERE key LIKE 'b21.%' AND order_index > 101 AND order_index < 1000;

INSERT INTO public.card_templates (
  template_type_id, section_source_id, section_number, document, key, kind,
  default_title, anchor, order_index, is_deletable, is_hideable, is_source_fed,
  is_fixed_position, default_visible, default_fields, is_active,
  template_version_id, title_mode
)
SELECT t.template_type_id, t.section_source_id, t.section_number, t.document,
       'b21.pathways', 'text', 'Key impact pathways', 'free', 102,
       true, true, false, false, true,
       '[{"field_role": "narrative", "content_html": ""}]'::jsonb, true,
       t.template_version_id, t.title_mode
  FROM public.card_templates t
 WHERE t.key = 'b21.impacts'
   AND NOT EXISTS (
     SELECT 1 FROM public.card_templates x
      WHERE x.key = 'b21.pathways'
        AND x.template_version_id = t.template_version_id
   );

-- 2. Existing proposals: shift later B2.1 cards, then seed the empty block.
UPDATE public.proposal_cards pc
   SET order_index = pc.order_index + 1, updated_at = now()
  FROM public.proposal_cards imp
 WHERE imp.template_key = 'b21.impacts'
   AND imp.deleted_at IS NULL
   AND pc.section_id = imp.section_id
   AND pc.proposal_id = imp.proposal_id
   AND pc.deleted_at IS NULL
   AND pc.order_index > imp.order_index
   AND pc.order_index < 1000;

WITH seeded AS (
  INSERT INTO public.proposal_cards (
    proposal_id, section_id, document, kind, template_key, title, order_index,
    anchor, is_deletable, is_hideable, is_source_fed, is_fixed_position,
    is_visible, origin, title_mode
  )
  SELECT imp.proposal_id, imp.section_id, imp.document, 'text', 'b21.pathways',
         'Key impact pathways', imp.order_index + 1, 'free',
         true, true, false, false, true, 'auto', imp.title_mode
    FROM public.proposal_cards imp
   WHERE imp.template_key = 'b21.impacts'
     AND imp.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.proposal_cards x
        WHERE x.proposal_id = imp.proposal_id
          AND x.template_key = 'b21.pathways'
          AND x.deleted_at IS NULL
     )
  RETURNING id, proposal_id
)
INSERT INTO public.card_fields (card_id, proposal_id, content_html, order_index, field_role, origin, heading_enabled)
SELECT s.id, s.proposal_id, '', 0, 'narrative', 'auto', false FROM seeded s;