UPDATE public.card_fields
SET content_html = replace(
      replace(content_html, 'class="table-caption"', 'class="document-table-caption"'),
      'class="table-caption ',
      'class="document-table-caption '
    ),
    updated_at = now()
WHERE content_html LIKE '%table-caption%'
  AND content_html NOT LIKE '%document-table-caption%';

UPDATE public.card_templates
SET default_fields = replace(
      replace(default_fields::text, 'class=\"table-caption\"', 'class=\"document-table-caption\"'),
      'class=\"table-caption ',
      'class=\"document-table-caption '
    )::jsonb,
    updated_at = now()
WHERE default_fields::text LIKE '%table-caption%'
  AND default_fields::text NOT LIKE '%document-table-caption%';