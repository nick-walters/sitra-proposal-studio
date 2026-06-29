
CREATE POLICY "Authenticated users can read profile avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-avatars' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can read proposal logos"
ON storage.objects FOR SELECT
USING (bucket_id = 'proposal-logos' AND auth.uid() IS NOT NULL);
