-- Fix existing figures that stored signed URLs instead of storage paths
-- Extract the file path from the signed URL pattern: /proposal-files/{path}?token=...
UPDATE public.figures
SET content = jsonb_set(
  content,
  '{imageUrl}',
  to_jsonb(
    regexp_replace(
      content->>'imageUrl',
      '^.*/proposal-files/([^?]+)\?.*$',
      '\1'
    )
  )
)
WHERE content->>'imageUrl' LIKE '%/proposal-files/%token=%';