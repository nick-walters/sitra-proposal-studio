-- 1. Module-level visibility
ALTER TABLE public.card_fields
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;

-- 2. Template: TRL table becomes a second module of b11.maturity
WITH trl AS (
  SELECT t.template_version_id, (t.default_fields -> 0) AS fld
  FROM public.card_templates t
  WHERE t.key = 'b11.trl_table'
)
UPDATE public.card_templates m
SET default_fields = jsonb_build_array(
      jsonb_build_object('field_role', 'narrative', 'content_html', ''),
      trl.fld
    ),
    updated_at = now()
FROM trl
WHERE m.key = 'b11.maturity'
  AND m.template_version_id IS NOT DISTINCT FROM trl.template_version_id;

DELETE FROM public.card_templates WHERE key = 'b11.trl_table';

-- 3. Existing proposals: move the TRL card's modules into the maturity card
WITH pairs AS (
  SELECT trl.id AS trl_card, mat.id AS mat_card,
         COALESCE((SELECT max(f.order_index) FROM public.card_fields f
                   WHERE f.card_id = mat.id AND f.deleted_at IS NULL), -1) AS max_idx
  FROM public.proposal_cards trl
  JOIN public.proposal_cards mat
    ON mat.proposal_id = trl.proposal_id
   AND mat.section_id = trl.section_id
   AND mat.template_key = 'b11.maturity'
   AND mat.deleted_at IS NULL
  WHERE trl.template_key = 'b11.trl_table' AND trl.deleted_at IS NULL
)
UPDATE public.card_fields f
SET card_id = p.mat_card,
    order_index = p.max_idx + 1 + f.order_index,
    updated_at = now()
FROM pairs p
WHERE f.card_id = p.trl_card AND f.deleted_at IS NULL;

DELETE FROM public.card_fields f
USING public.proposal_cards c
WHERE f.card_id = c.id AND c.template_key = 'b11.trl_table';

DELETE FROM public.proposal_cards WHERE template_key = 'b11.trl_table';

-- 4. B2.1 impact summary caption: new wording, numberable markup
UPDATE public.card_templates
SET default_fields = replace(default_fields::text,
      'Key elements of the impact section', 'Impact summary canvas')::jsonb,
    updated_at = now()
WHERE key = 'b21.impact_summary';

UPDATE public.card_fields f
SET content_html = replace(
      replace(f.content_html,
        '<p style="text-align: left;"><em>Key elements of the impact section</em></p>',
        '<p class="document-table-caption" style="text-align: left;"><span data-caption-label="" contenteditable="false" style="user-select: none; font-weight: bold; font-style: italic;"></span><em>Impact summary canvas</em></p>'),
      'Key elements of the impact section', 'Impact summary canvas'),
    updated_at = now()
FROM public.proposal_cards c
WHERE f.card_id = c.id
  AND c.template_key = 'b21.impact_summary'
  AND f.deleted_at IS NULL
  AND f.content_html LIKE '%Key elements of the impact section%';