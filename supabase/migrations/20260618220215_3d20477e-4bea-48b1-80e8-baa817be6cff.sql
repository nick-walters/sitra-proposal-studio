-- Recreate registry storage policies with broader role and add SELECT
DROP POLICY IF EXISTS "participant_logos_registry_insert" ON storage.objects;
DROP POLICY IF EXISTS "participant_logos_registry_update" ON storage.objects;
DROP POLICY IF EXISTS "participant_logos_registry_delete" ON storage.objects;
DROP POLICY IF EXISTS "participant_logos_registry_select" ON storage.objects;

CREATE POLICY "participant_logos_registry_select"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'participant-logos' AND name LIKE 'registry/%');

CREATE POLICY "participant_logos_registry_insert"
ON storage.objects FOR INSERT TO public
WITH CHECK (
  bucket_id = 'participant-logos'
  AND name LIKE 'registry/%'
  AND auth.uid() IS NOT NULL
  AND public.is_coordinator_or_above(auth.uid())
);

CREATE POLICY "participant_logos_registry_update"
ON storage.objects FOR UPDATE TO public
USING (
  bucket_id = 'participant-logos'
  AND name LIKE 'registry/%'
  AND auth.uid() IS NOT NULL
  AND public.is_coordinator_or_above(auth.uid())
)
WITH CHECK (
  bucket_id = 'participant-logos'
  AND name LIKE 'registry/%'
  AND auth.uid() IS NOT NULL
  AND public.is_coordinator_or_above(auth.uid())
);

CREATE POLICY "participant_logos_registry_delete"
ON storage.objects FOR DELETE TO public
USING (
  bucket_id = 'participant-logos'
  AND name LIKE 'registry/%'
  AND auth.uid() IS NOT NULL
  AND public.is_coordinator_or_above(auth.uid())
);