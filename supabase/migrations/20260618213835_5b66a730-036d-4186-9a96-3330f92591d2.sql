
CREATE POLICY "participant_logos_registry_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'participant-logos'
  AND name LIKE 'registry/%'
  AND public.is_coordinator_or_above(auth.uid())
);

CREATE POLICY "participant_logos_registry_update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'participant-logos'
  AND name LIKE 'registry/%'
  AND public.is_coordinator_or_above(auth.uid())
)
WITH CHECK (
  bucket_id = 'participant-logos'
  AND name LIKE 'registry/%'
  AND public.is_coordinator_or_above(auth.uid())
);

CREATE POLICY "participant_logos_registry_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'participant-logos'
  AND name LIKE 'registry/%'
  AND public.is_coordinator_or_above(auth.uid())
);
