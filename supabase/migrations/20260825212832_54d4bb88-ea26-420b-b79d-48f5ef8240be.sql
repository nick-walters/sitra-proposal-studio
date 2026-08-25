-- B1.1 "Research & innovation maturity": resolve the two TRL tables into one.
--
-- How the duplicate arose: the legacy B1.1 migration carried SUSIE-Q's prose
-- AND its inline TRL table into the block's first (narrative) module, while
-- the separate b11.trl_table block still held its untouched, empty template
-- table. When that block was folded into the maturity block as a second
-- module, the proposal ended up with both: real content under the legacy
-- caption in module 1, and an empty table under the correct caption in
-- module 2.

-- 1. Template default: the TRL table's three specified columns.
UPDATE public.card_templates
SET default_fields = jsonb_set(default_fields, '{1,content_html}',
      to_jsonb($html$<p class="document-table-caption" style="text-align: left;"><span data-caption-label="" contenteditable="false" style="user-select: none; font-weight: bold; font-style: italic;"></span><em>Starting &amp; target technology readiness levels</em></p><table class="he-table" style="min-width: 75px;"><colgroup><col style="min-width: 25px;"><col style="min-width: 25px;"><col style="min-width: 25px;"></colgroup><tbody><tr><th class="he-table-header" colspan="1" rowspan="1"><p>Output &amp; objective to which it contributes</p></th><th class="he-table-header" colspan="1" rowspan="1"><p>TRL advance</p></th><th class="he-table-header" colspan="1" rowspan="1"><p>Route to advancing the TRL</p></th></tr><tr><td class="he-table-cell" colspan="1" rowspan="1"><p></p></td><td class="he-table-cell" colspan="1" rowspan="1"><p></p></td><td class="he-table-cell" colspan="1" rowspan="1"><p></p></td></tr></tbody></table>$html$::text)),
    updated_at = now()
WHERE key = 'b11.maturity'
  AND jsonb_array_length(default_fields) > 1;

-- 2. SUSIE-Q: move the migrated table, byte for byte, into the table module
--    under the correct caption, and leave the narrative with prose only.
WITH src AS (
  SELECT f.id,
         f.content_html AS html,
         position('<p class="table-caption"' IN f.content_html)                   AS cap_pos,
         position('<table class="he-table" style="min-width: 75px;"' IN f.content_html) AS tbl_pos
  FROM public.card_fields f
  WHERE f.id = '98a15d37-2a99-4a9d-9acb-97923b5ffd7b'
)
UPDATE public.card_fields t
SET content_html = $cap$<p class="document-table-caption" style="text-align: left;"><span data-caption-label="" contenteditable="false" style="user-select: none; font-weight: bold; font-style: italic;"></span><em>Starting &amp; target technology readiness levels</em></p>$cap$ || substr(src.html, src.tbl_pos),
    order_index = 1,
    updated_at = now()
FROM src
WHERE t.id = '7a0569c5-58c3-48d3-a1bc-07c8fe1207a0'
  AND src.cap_pos > 0 AND src.tbl_pos > 0;

UPDATE public.card_fields f
SET content_html = rtrim(substr(f.content_html, 1,
      position('<p class="table-caption"' IN f.content_html) - 1)),
    order_index = 0,
    updated_at = now()
WHERE f.id = '98a15d37-2a99-4a9d-9acb-97923b5ffd7b'
  AND position('<p class="table-caption"' IN f.content_html) > 0;
