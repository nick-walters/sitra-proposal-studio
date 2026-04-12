
-- Drop the overly broad INSERT policy
DROP POLICY IF EXISTS "Recipients insertable by authenticated" ON public.proposal_message_recipients;

-- Drop the overly broad DELETE policy
DROP POLICY IF EXISTS "Recipients deletable by authenticated" ON public.proposal_message_recipients;

-- New INSERT: user must have a role on the message's proposal
CREATE POLICY "Recipients insertable by proposal members"
ON public.proposal_message_recipients
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.proposal_messages pm
    WHERE pm.id = message_id
      AND public.has_any_proposal_role(auth.uid(), pm.proposal_id)
  )
);

-- New DELETE: only the recipient themselves or a proposal admin
CREATE POLICY "Recipients deletable by self or admin"
ON public.proposal_message_recipients
FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.proposal_messages pm
    WHERE pm.id = message_id
      AND public.is_proposal_admin(auth.uid(), pm.proposal_id)
  )
);
