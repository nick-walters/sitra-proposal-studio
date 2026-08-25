-- 1. Restore the caption class so auto-numbering recognises these captions
UPDATE public.card_fields
SET content_html = replace(
      content_html,
      '<p style="text-align: left;"><em>Starting &amp; target technology readiness levels</em></p>',
      '<p class="document-table-caption" style="text-align: left;"><em>Starting &amp; target technology readiness levels</em></p>')
WHERE content_html LIKE '%<p style="text-align: left;"><em>Starting &amp; target technology readiness levels</em></p>%';

UPDATE public.card_fields
SET content_html = replace(
      content_html,
      '<p style="text-align: left;"><em>Impact summary canvas</em></p>',
      '<p class="document-table-caption" style="text-align: left;"><em>Impact summary canvas</em></p>')
WHERE content_html LIKE '%<p style="text-align: left;"><em>Impact summary canvas</em></p>%';

-- 2. TRL table column headings (proposal content)
UPDATE public.card_fields
SET content_html = replace(
      replace(content_html,
        '<p style="text-align: justify;">Output &amp; objective to which it contributes</p>',
        '<p style="text-align: justify;">KER</p>'),
      '<p style="text-align: justify;">TRL advance</p>',
      '<p style="text-align: justify;">Current → target TRLs</p>')
WHERE content_html LIKE '%Output &amp; objective to which it contributes%'
   OR content_html LIKE '%>TRL advance<%';

-- 3. TRL table column headings (template defaults, published + draft)
UPDATE public.card_templates
SET default_fields = replace(
      replace(default_fields::text,
        '<p>Output &amp; objective to which it contributes</p>',
        '<p>KER</p>'),
      '<p>TRL advance</p>',
      '<p>Current → target TRLs</p>')::jsonb
WHERE key = 'b11.maturity';

-- 4. Impact summary block header: editor only, omitted from preview/export
UPDATE public.card_templates SET title_mode = 'editor_only' WHERE key = 'b21.impact_summary';
UPDATE public.proposal_cards SET title_mode = 'editor_only' WHERE template_key = 'b21.impact_summary';