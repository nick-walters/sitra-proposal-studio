ALTER TABLE public.participant_members ADD COLUMN IF NOT EXISTS title text;

UPDATE public.participant_members pm
SET title = p.main_contact_title
FROM public.participants p
WHERE p.id = pm.participant_id
  AND pm.is_primary_contact = true
  AND (pm.title IS NULL OR pm.title = '')
  AND p.main_contact_title IS NOT NULL
  AND p.main_contact_title <> '';

ALTER TABLE public.participants DROP COLUMN IF EXISTS main_contact_phone2;