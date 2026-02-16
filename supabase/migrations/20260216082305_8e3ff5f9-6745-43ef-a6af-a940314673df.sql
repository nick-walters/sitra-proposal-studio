CREATE POLICY "Dependencies updatable by admins"
  ON public.wp_dependencies
  FOR UPDATE
  USING (is_proposal_admin(auth.uid(), proposal_id))
  WITH CHECK (is_proposal_admin(auth.uid(), proposal_id));