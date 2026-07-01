DROP POLICY IF EXISTS "ocd_uploads_insert" ON public.participant_ocd_uploads;

CREATE POLICY "ocd_uploads_insert" ON public.participant_ocd_uploads
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND public.can_edit_proposal(auth.uid(), proposal_id)
  );