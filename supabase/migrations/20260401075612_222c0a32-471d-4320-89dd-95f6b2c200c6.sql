
CREATE POLICY "Users can upload own avatar"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'profile-avatars'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_global_admin(auth.uid())
  )
);

CREATE POLICY "Users can update own avatar"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_global_admin(auth.uid())
  )
);

CREATE POLICY "Users can delete own avatar"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'profile-avatars'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.is_global_admin(auth.uid())
  )
);
