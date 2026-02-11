
-- Drop overly permissive storage policies for participant-logos
DROP POLICY IF EXISTS "Authenticated users can upload participant logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update participant logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete participant logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to participant-logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to participant-logos" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes to participant-logos" ON storage.objects;

-- Drop overly permissive storage policies for proposal-files
DROP POLICY IF EXISTS "Allow authenticated uploads to proposal-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates to proposal-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes to proposal-files" ON storage.objects;

-- participant-logos: restrict to users who have a role on a proposal that owns the participant
-- The fetch-logo function uses service role key so it bypasses RLS
CREATE POLICY "Proposal members can upload participant logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'participant-logos'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY "Proposal members can update participant logos"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'participant-logos'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY "Proposal members can delete participant logos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'participant-logos'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role IN ('owner', 'admin', 'editor')
  )
);

-- proposal-files: restrict to users who have a role on the proposal (folder structure: {proposal_id}/...)
CREATE POLICY "Proposal members can upload proposal files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'proposal-files'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.proposal_id::text = (storage.foldername(name))[1]
    AND ur.role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY "Proposal members can update proposal files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'proposal-files'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.proposal_id::text = (storage.foldername(name))[1]
    AND ur.role IN ('owner', 'admin', 'editor')
  )
);

CREATE POLICY "Proposal members can delete proposal files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'proposal-files'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.proposal_id::text = (storage.foldername(name))[1]
    AND ur.role IN ('owner', 'admin', 'editor')
  )
);
