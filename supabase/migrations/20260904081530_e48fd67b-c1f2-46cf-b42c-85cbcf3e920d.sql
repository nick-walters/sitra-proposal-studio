DROP POLICY IF EXISTS "ocd_uploads_select" ON public.participant_ocd_uploads;
CREATE POLICY "ocd_uploads_select"
ON public.participant_ocd_uploads
FOR SELECT
TO authenticated
USING (
  public.is_global_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.proposal_id = participant_ocd_uploads.proposal_id
  )
);

DROP POLICY IF EXISTS "ocd_uploads_delete" ON public.participant_ocd_uploads;
CREATE POLICY "ocd_uploads_delete"
ON public.participant_ocd_uploads
FOR DELETE
TO authenticated
USING (
  public.is_global_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.proposal_id = participant_ocd_uploads.proposal_id
      AND user_roles.role = 'coordinator'::app_role
  )
);