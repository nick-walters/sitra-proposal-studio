-- Fix participant-logos storage policies: the previous version extracted only the first
-- hex segment of the participant UUID (before the first dash), which never equals the full UUID.
-- Use substring() to take the full 36-character UUID after the 'logos/' prefix.

DROP POLICY IF EXISTS "participant_logos_insert_editors" ON storage.objects;
CREATE POLICY "participant_logos_insert_editors"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'participant-logos'
  AND (storage.foldername(name))[1] = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.id::text = substring(name from 7 for 36)
      AND public.can_edit_proposal(auth.uid(), p.proposal_id)
  )
);

DROP POLICY IF EXISTS "participant_logos_update_editors" ON storage.objects;
CREATE POLICY "participant_logos_update_editors"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'participant-logos'
  AND (storage.foldername(name))[1] = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.id::text = substring(name from 7 for 36)
      AND public.can_edit_proposal(auth.uid(), p.proposal_id)
  )
)
WITH CHECK (
  bucket_id = 'participant-logos'
  AND (storage.foldername(name))[1] = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.id::text = substring(name from 7 for 36)
      AND public.can_edit_proposal(auth.uid(), p.proposal_id)
  )
);

DROP POLICY IF EXISTS "participant_logos_delete_editors" ON storage.objects;
CREATE POLICY "participant_logos_delete_editors"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'participant-logos'
  AND (storage.foldername(name))[1] = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.id::text = substring(name from 7 for 36)
      AND public.can_edit_proposal(auth.uid(), p.proposal_id)
  )
);

DROP POLICY IF EXISTS "participant_logos_logos_select_members" ON storage.objects;
CREATE POLICY "participant_logos_logos_select_members"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'participant-logos'
  AND (storage.foldername(name))[1] = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.id::text = substring(name from 7 for 36)
      AND public.has_any_proposal_role(auth.uid(), p.proposal_id)
  )
);