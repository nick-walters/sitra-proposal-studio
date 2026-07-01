DROP POLICY IF EXISTS participant_logos_registry_select ON storage.objects;
CREATE POLICY participant_logos_registry_select ON storage.objects FOR SELECT
USING (bucket_id = 'participant-logos' AND name LIKE 'registry/%' AND auth.uid() IS NOT NULL);