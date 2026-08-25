UPDATE public.card_fields f
SET content_html = replace(f.content_html,
      'Output&nbsp; &amp; objective to which it contributes',
      'Output &amp; objective to which it contributes'),
    updated_at = now()
FROM public.proposal_cards c
WHERE c.id = f.card_id
  AND c.template_key = 'b11.maturity'
  AND f.deleted_at IS NULL
  AND f.content_html LIKE '%Output&nbsp; &amp; objective to which it contributes%';
