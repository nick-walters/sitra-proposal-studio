-- Add destination validation (WITH CHECK) to three storage UPDATE policies.

DROP POLICY IF EXISTS "Users can update own avatar" ON storage.objects;
CREATE POLICY "Users can update own avatar"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR is_global_admin(auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'profile-avatars'
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR is_global_admin(auth.uid())
  )
);

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'profile-avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'profile-avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

DROP POLICY IF EXISTS "Editors can update proposal files" ON storage.objects;
CREATE POLICY "Editors can update proposal files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'proposal-files'
  AND can_edit_proposal(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'proposal-files'
  AND can_edit_proposal(auth.uid(), ((storage.foldername(name))[1])::uuid)
);