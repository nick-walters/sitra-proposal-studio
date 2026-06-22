
-- Add SELECT policy for participant-logos bucket 'logos/' path now that the bucket is private.
-- 'registry/' path keeps its existing public SELECT policy (shared organisation registry).
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
    WHERE p.id::text = split_part(split_part(objects.name, '/', 2), '-', 1)
      AND public.has_any_proposal_role(auth.uid(), p.proposal_id)
  )
);
