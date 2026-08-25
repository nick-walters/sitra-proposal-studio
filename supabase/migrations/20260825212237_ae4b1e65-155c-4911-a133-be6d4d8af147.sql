-- B2.1 impact summary: give the caption the caption class so the automatic,
-- uneditable "Table 2.1.a." label is derived from position like every other
-- table caption. Only the caption paragraph is touched; the table markup and
-- all cell content are left byte-identical.
UPDATE card_fields f
SET content_html = replace(
      f.content_html,
      '<p style="text-align: left;"><em>Impact summary canvas</em></p>',
      '<p class="document-table-caption" style="text-align: left;"><span><strong><em><span data-caption-label="" contenteditable="false" style="user-select: none; font-weight: bold; font-style: italic;"></span></em></strong></span><em>Impact summary canvas</em></p>'
    )
FROM proposal_cards c
WHERE c.id = f.card_id
  AND c.template_key = 'b21.impact_summary'
  AND f.deleted_at IS NULL
  AND f.content_html LIKE '<p style="text-align: left;"><em>Impact summary canvas</em></p>%';