
DROP POLICY IF EXISTS "Users can upload proposal logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own logos" ON storage.objects;

CREATE POLICY "Proposal editors can upload proposal logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'proposal-logos'
  AND auth.uid() IS NOT NULL
  AND public.can_edit_proposal(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Proposal editors can update proposal logos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'proposal-logos'
  AND auth.uid() IS NOT NULL
  AND public.can_edit_proposal(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'proposal-logos'
  AND auth.uid() IS NOT NULL
  AND public.can_edit_proposal(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Proposal editors can delete proposal logos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'proposal-logos'
  AND auth.uid() IS NOT NULL
  AND public.can_edit_proposal(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
