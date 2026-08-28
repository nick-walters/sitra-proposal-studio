ALTER TABLE public.participant_infrastructure
  ADD COLUMN IF NOT EXISTS project_support text;

ALTER TABLE public.participant_infrastructure
  DROP CONSTRAINT IF EXISTS participant_infrastructure_project_support_len;
ALTER TABLE public.participant_infrastructure
  ADD CONSTRAINT participant_infrastructure_project_support_len
  CHECK (project_support IS NULL OR char_length(project_support) <= 200);

-- New proposals: the capacity block is seeded with the infrastructure module.
UPDATE public.card_templates
   SET default_fields = jsonb_build_array(
         jsonb_build_object('heading', NULL, 'content_html', '<div data-b32-infra-table=""></div>')
       )
 WHERE key = 'b32.capacity';

-- Existing proposals: append the module where it is missing.
INSERT INTO public.card_fields (card_id, proposal_id, heading, content_html, order_index, field_role, origin)
SELECT pc.id, pc.proposal_id, NULL, '<div data-b32-infra-table=""></div>',
       COALESCE((SELECT max(f.order_index) + 1 FROM public.card_fields f
                  WHERE f.card_id = pc.id AND f.deleted_at IS NULL), 0),
       'narrative', 'auto'
  FROM public.proposal_cards pc
 WHERE pc.template_key = 'b32.capacity'
   AND pc.deleted_at IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.card_fields f
      WHERE f.card_id = pc.id AND f.deleted_at IS NULL
        AND f.content_html LIKE '%data-b32-infra-table%'
   );