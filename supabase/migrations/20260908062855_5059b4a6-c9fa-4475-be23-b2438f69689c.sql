DROP POLICY IF EXISTS "Editors can notify proposal members" ON public.notifications;

CREATE POLICY "Proposal members can notify proposal members"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  proposal_id IS NOT NULL
  AND public.has_any_proposal_role(auth.uid(), proposal_id)
  AND (
    user_id = auth.uid()
    OR public.has_any_proposal_role(user_id, proposal_id)
  )
);