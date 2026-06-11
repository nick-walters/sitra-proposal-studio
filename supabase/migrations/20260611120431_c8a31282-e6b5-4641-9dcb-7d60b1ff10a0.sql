
CREATE POLICY "Proposal admins can delete backups"
ON public.proposal_backups
FOR DELETE
USING (public.is_proposal_admin(auth.uid(), proposal_id));

CREATE POLICY "Proposal admins can delete backup files"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'proposal-backups'
  AND public.is_proposal_admin(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
);
