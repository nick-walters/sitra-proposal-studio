
DROP POLICY IF EXISTS "Authenticated users can receive realtime messages for their cha" ON realtime.messages;

CREATE POLICY "Authenticated users can receive realtime messages for their cha"
  ON realtime.messages FOR SELECT TO authenticated
  USING (
    is_global_admin(auth.uid())
    OR topic = 'realtime:notifications'
    OR topic = 'realtime:profile-name-check'
    OR (topic = 'realtime:proposals-realtime' AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()))
    OR (topic LIKE 'realtime:feedback-comments-%' AND EXISTS (
      SELECT 1 FROM public.feedback f
      WHERE f.id = (substring(messages.topic, 'realtime:feedback-comments-(.*)'))::uuid
        AND f.user_id = auth.uid()
    ))
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.proposal_id IS NOT NULL
        AND POSITION((ur.proposal_id)::text IN messages.topic) > 0
    )
  );

DROP POLICY IF EXISTS "Recipients insertable by proposal members" ON public.proposal_message_recipients;

CREATE POLICY "Message authors can add proposal-member recipients"
  ON public.proposal_message_recipients FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.proposal_messages pm
      WHERE pm.id = proposal_message_recipients.message_id
        AND pm.author_id = auth.uid()
        AND public.has_any_proposal_role(auth.uid(), pm.proposal_id)
    )
    AND EXISTS (
      SELECT 1 FROM public.proposal_messages pm2
      WHERE pm2.id = proposal_message_recipients.message_id
        AND public.has_any_proposal_role(proposal_message_recipients.user_id, pm2.proposal_id)
    )
  );
