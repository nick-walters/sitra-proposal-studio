
-- Clean inline font-size, font-family, line-height from wp_draft_tasks descriptions
UPDATE wp_draft_tasks SET description = 
  regexp_replace(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          regexp_replace(description, 
                            'font-size\s*:\s*[^;]+;?\s*', '', 'gi'),
                          'font-family\s*:\s*[^;]+;?\s*', '', 'gi'),
                        'line-height\s*:\s*[^;]+;?\s*', '', 'gi'),
                      'font-size-adjust\s*:\s*[^;]+;?\s*', '', 'gi'),
                    'font-stretch\s*:\s*[^;]+;?\s*', '', 'gi'),
                  'font-variant-numeric\s*:\s*[^;]+;?\s*', '', 'gi'),
                'font-variant-east-asian\s*:\s*[^;]+;?\s*', '', 'gi'),
              'font-variant-alternates\s*:\s*[^;]+;?\s*', '', 'gi'),
            'font-language-override\s*:\s*[^;]+;?\s*', '', 'gi'),
          'font-kerning\s*:\s*[^;]+;?\s*', '', 'gi'),
        'font-optical-sizing\s*:\s*[^;]+;?\s*', '', 'gi'),
      'font-feature-settings\s*:\s*[^;]+;?\s*', '', 'gi'),
    'font-variation-settings\s*:\s*[^;]+;?\s*', '', 'gi')
WHERE wp_draft_id IN (SELECT id FROM wp_drafts WHERE proposal_id = '9d7716c3-e0cb-4bad-a862-1abc0acb97e4')
  AND description LIKE '%font-size%';

-- Also clean empty style attributes left behind
UPDATE wp_draft_tasks SET description = 
  regexp_replace(description, ' style="\s*"', '', 'gi')
WHERE wp_draft_id IN (SELECT id FROM wp_drafts WHERE proposal_id = '9d7716c3-e0cb-4bad-a862-1abc0acb97e4')
  AND description LIKE '%style=""%';
