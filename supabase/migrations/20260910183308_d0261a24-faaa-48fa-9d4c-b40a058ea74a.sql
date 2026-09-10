-- Retire banner_title_override as a live field: fold its manual line breaks
-- into proposals.title, which now carries them itself.
--
-- Only overrides that still flatten to the SAME words as the current title are
-- migrated; anything else is stale wording (the whole reason for this change)
-- and is discarded, leaving title byte-identical.
--
-- The column is deliberately NOT dropped, so this step is reversible. A later
-- migration can drop it once this has been proven in use.
UPDATE public.proposals
SET title = banner_title_override
WHERE banner_title_override IS NOT NULL
  AND banner_title_override IS DISTINCT FROM title
  AND btrim(regexp_replace(banner_title_override, '\s+', ' ', 'g'))
      = btrim(regexp_replace(title, '\s+', ' ', 'g'));