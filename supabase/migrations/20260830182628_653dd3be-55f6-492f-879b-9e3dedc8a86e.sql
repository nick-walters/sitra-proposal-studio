DROP POLICY IF EXISTS "Editors can create notifications" ON public.notifications;

CREATE POLICY "Editors can notify proposal members"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_edit_proposal(auth.uid(), proposal_id)
  AND (
    user_id = auth.uid()
    OR public.has_any_proposal_role(user_id, proposal_id)
  )
);

DROP POLICY IF EXISTS "participant_logos_registry_select" ON storage.objects;

CREATE POLICY "participant_logos_registry_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'participant-logos'
  AND name LIKE 'registry/%'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);