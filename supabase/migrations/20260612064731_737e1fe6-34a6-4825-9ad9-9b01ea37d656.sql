CREATE POLICY "Editors can upload figure cache"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'proposal-backups'
  AND (string_to_array(name, '/'))[2] = '_figures-cache'
  AND public.can_edit_proposal(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
);

CREATE POLICY "Editors can update figure cache"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'proposal-backups'
  AND (string_to_array(name, '/'))[2] = '_figures-cache'
  AND public.can_edit_proposal(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'proposal-backups'
  AND (string_to_array(name, '/'))[2] = '_figures-cache'
  AND public.can_edit_proposal(auth.uid(), ((string_to_array(name, '/'))[1])::uuid)
);