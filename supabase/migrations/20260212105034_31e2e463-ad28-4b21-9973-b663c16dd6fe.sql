-- Make proposal-files bucket private
UPDATE storage.buckets SET public = false WHERE id = 'proposal-files';

-- Ensure authenticated users can read proposal files they have access to
-- (proposal members can download files from their proposals)
CREATE POLICY "Proposal members can read files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'proposal-files'
  AND public.has_any_proposal_role(auth.uid(), (storage.foldername(name))[1]::uuid)
);