
-- Fix: user_roles UPDATE escalation
-- Restrict USING so coordinators can only update editor/viewer rows
DROP POLICY IF EXISTS "Proposal coordinators can update proposal roles" ON public.user_roles;
CREATE POLICY "Proposal coordinators can update proposal roles"
ON public.user_roles
FOR UPDATE
USING (
  proposal_id IS NOT NULL
  AND is_proposal_admin(auth.uid(), proposal_id)
  AND role = ANY (ARRAY['editor'::app_role, 'viewer'::app_role])
)
WITH CHECK (
  proposal_id IS NOT NULL
  AND is_proposal_admin(auth.uid(), proposal_id)
  AND role = ANY (ARRAY['editor'::app_role, 'viewer'::app_role])
);

-- Fix: realtime proposals-realtime channel overly broad subscription
-- Require the subscriber to have a proposal-scoped role (or be global admin)
DROP POLICY IF EXISTS "Authenticated users can receive realtime messages for their cha" ON realtime.messages;
CREATE POLICY "Authenticated users can receive realtime messages for their cha"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  is_global_admin(auth.uid())
  OR topic = 'realtime:notifications'
  OR topic = 'realtime:profile-name-check'
  OR (
    topic = 'realtime:proposals-realtime'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.proposal_id IS NOT NULL
    )
  )
  OR (
    topic LIKE 'realtime:feedback-comments-%'
    AND EXISTS (
      SELECT 1 FROM public.feedback f
      WHERE f.id = (substring(messages.topic, 'realtime:feedback-comments-(.*)'))::uuid
        AND f.user_id = auth.uid()
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.proposal_id IS NOT NULL
      AND POSITION(ur.proposal_id::text IN messages.topic) > 0
  )
);
