DROP POLICY IF EXISTS ocd_uploads_delete ON public.participant_ocd_uploads;

CREATE POLICY ocd_uploads_delete
ON public.participant_ocd_uploads
FOR DELETE
USING (public.is_proposal_admin(auth.uid(), proposal_id));