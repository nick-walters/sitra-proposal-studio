CREATE POLICY "Proposal members can view co-members roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  proposal_id IS NOT NULL
  AND public.has_any_proposal_role(auth.uid(), proposal_id)
);