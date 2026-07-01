DROP POLICY IF EXISTS "Users with proposal access can view case drafts" ON public.case_drafts;
CREATE POLICY "Users with proposal access can view case drafts"
  ON public.case_drafts FOR SELECT TO authenticated
  USING (has_any_proposal_role(auth.uid(), proposal_id));

DROP POLICY IF EXISTS "Admins/owners can insert case drafts" ON public.case_drafts;
CREATE POLICY "Admins/owners can insert case drafts"
  ON public.case_drafts FOR INSERT TO authenticated
  WITH CHECK (is_proposal_admin(auth.uid(), proposal_id));

DROP POLICY IF EXISTS "Admins/owners can update case drafts" ON public.case_drafts;
CREATE POLICY "Admins/owners can update case drafts"
  ON public.case_drafts FOR UPDATE TO authenticated
  USING (is_proposal_admin(auth.uid(), proposal_id));

DROP POLICY IF EXISTS "Admins/owners can delete case drafts" ON public.case_drafts;
CREATE POLICY "Admins/owners can delete case drafts"
  ON public.case_drafts FOR DELETE TO authenticated
  USING (is_proposal_admin(auth.uid(), proposal_id));