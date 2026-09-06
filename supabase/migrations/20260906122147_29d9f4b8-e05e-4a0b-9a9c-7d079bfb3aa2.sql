ALTER TABLE public.participant_members
  ADD COLUMN IF NOT EXISTS phone text;

-- Move phone-shaped values out of role_in_project onto the new phone column
UPDATE public.participant_members
SET phone = btrim(role_in_project),
    role_in_project = NULL
WHERE role_in_project IS NOT NULL
  AND btrim(role_in_project) <> ''
  AND btrim(role_in_project) ~ '^[+0-9][0-9 ()+\-]{5,}$';

-- Backfill the main contact's phone from participants.main_contact_phone
-- only where the member row has none
UPDATE public.participant_members pm
SET phone = btrim(p.main_contact_phone)
FROM public.participants p
WHERE pm.participant_id = p.id
  AND pm.is_primary_contact = true
  AND (pm.phone IS NULL OR btrim(pm.phone) = '')
  AND p.main_contact_phone IS NOT NULL
  AND btrim(p.main_contact_phone) <> '';