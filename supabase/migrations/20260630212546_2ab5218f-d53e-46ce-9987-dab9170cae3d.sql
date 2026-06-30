DROP POLICY IF EXISTS "Authenticated users can read proposal logos" ON storage.objects;

CREATE POLICY "Proposal members can read proposal logos"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'proposal-logos'
  AND auth.uid() IS NOT NULL
  AND public.has_any_proposal_role(
    auth.uid(),
    ((storage.foldername(name))[1])::uuid
  )
);