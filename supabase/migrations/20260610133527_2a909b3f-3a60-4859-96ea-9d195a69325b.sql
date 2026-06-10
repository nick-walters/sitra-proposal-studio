
-- RLS on storage.objects for the proposal-backups bucket.
-- Object key pattern: {proposal_id}/{YYYY-MM-DD HH-MM-SS}/{filename}

CREATE POLICY "Proposal admins can read backup files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'proposal-backups'
  AND public.is_proposal_admin(
    auth.uid(),
    (string_to_array(name, '/'))[1]::uuid
  )
);
