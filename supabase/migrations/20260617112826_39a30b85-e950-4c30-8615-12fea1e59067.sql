DROP POLICY IF EXISTS "Authenticated users can receive realtime messages for their cha" ON realtime.messages;

CREATE POLICY "Authenticated users can receive realtime messages for their cha"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_global_admin(auth.uid())
  OR topic = 'realtime:notifications'
  OR topic = 'realtime:profile-name-check'
  OR topic = 'realtime:proposals-realtime'
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
      AND position(ur.proposal_id::text in messages.topic) > 0
  )
);