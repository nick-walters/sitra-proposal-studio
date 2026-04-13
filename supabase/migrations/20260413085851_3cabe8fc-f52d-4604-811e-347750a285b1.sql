
-- Fix INSERT policy to include coordinator role
DROP POLICY IF EXISTS "Proposal members can upload proposal files" ON storage.objects;
CREATE POLICY "Proposal members can upload proposal files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'proposal-files'
  AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.proposal_id::text = (storage.foldername(name))[1]
      AND ur.role = ANY (ARRAY['owner'::app_role, 'admin'::app_role, 'editor'::app_role, 'coordinator'::app_role])
  )
);

-- Fix UPDATE policy to include coordinator role
DROP POLICY IF EXISTS "Proposal members can update proposal files" ON storage.objects;
CREATE POLICY "Proposal members can update proposal files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'proposal-files'
  AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.proposal_id::text = (storage.foldername(name))[1]
      AND ur.role = ANY (ARRAY['owner'::app_role, 'admin'::app_role, 'editor'::app_role, 'coordinator'::app_role])
  )
);

-- Fix DELETE policy to include coordinator role
DROP POLICY IF EXISTS "Proposal members can delete proposal files" ON storage.objects;
CREATE POLICY "Proposal members can delete proposal files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'proposal-files'
  AND EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.proposal_id::text = (storage.foldername(name))[1]
      AND ur.role = ANY (ARRAY['owner'::app_role, 'admin'::app_role, 'editor'::app_role, 'coordinator'::app_role])
  )
);
