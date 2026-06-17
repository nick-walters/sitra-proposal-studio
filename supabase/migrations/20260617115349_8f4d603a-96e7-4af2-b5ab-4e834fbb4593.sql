DROP POLICY IF EXISTS "Proposal coordinators can manage proposal roles" ON public.user_roles;

CREATE POLICY "Proposal coordinators can view proposal roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (proposal_id IS NOT NULL AND public.is_proposal_admin(auth.uid(), proposal_id));

CREATE POLICY "Proposal coordinators can insert proposal roles"
  ON public.user_roles FOR INSERT TO authenticated
  WITH CHECK (
    proposal_id IS NOT NULL
    AND public.is_proposal_admin(auth.uid(), proposal_id)
    AND role = ANY (ARRAY['editor'::app_role, 'viewer'::app_role])
  );

CREATE POLICY "Proposal coordinators can update proposal roles"
  ON public.user_roles FOR UPDATE TO authenticated
  USING (proposal_id IS NOT NULL AND public.is_proposal_admin(auth.uid(), proposal_id))
  WITH CHECK (
    proposal_id IS NOT NULL
    AND public.is_proposal_admin(auth.uid(), proposal_id)
    AND role = ANY (ARRAY['editor'::app_role, 'viewer'::app_role])
  );

CREATE POLICY "Proposal coordinators can delete proposal roles"
  ON public.user_roles FOR DELETE TO authenticated
  USING (
    proposal_id IS NOT NULL
    AND public.is_proposal_admin(auth.uid(), proposal_id)
    AND role = ANY (ARRAY['editor'::app_role, 'viewer'::app_role])
  );