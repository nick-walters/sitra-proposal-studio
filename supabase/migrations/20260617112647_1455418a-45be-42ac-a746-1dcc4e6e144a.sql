DROP POLICY IF EXISTS "Proposal coordinators can manage proposal roles" ON public.user_roles;

CREATE POLICY "Proposal coordinators can manage proposal roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  proposal_id IS NOT NULL
  AND public.is_proposal_admin(auth.uid(), proposal_id)
)
WITH CHECK (
  proposal_id IS NOT NULL
  AND public.is_proposal_admin(auth.uid(), proposal_id)
  AND role IN ('editor'::public.app_role, 'viewer'::public.app_role)
);