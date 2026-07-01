DROP POLICY IF EXISTS "Authenticated users can receive realtime messages for their cha" ON realtime.messages;

CREATE POLICY "Authenticated users can receive realtime messages for their cha"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  is_global_admin(auth.uid())
  OR topic = 'realtime:notifications'::text
  OR topic = 'realtime:profile-name-check'::text
  OR (
    (topic ~~ 'realtime:feedback-comments-%'::text)
    AND EXISTS (
      SELECT 1 FROM feedback f
      WHERE f.id = (substring(messages.topic, 'realtime:feedback-comments-(.*)'::text))::uuid
        AND f.user_id = auth.uid()
    )
  )
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ((messages.topic ~~ 'realtime:comments:%'::text) AND ur.proposal_id = (split_part(messages.topic, ':'::text, 3))::uuid)
        OR ((messages.topic ~~ 'realtime:references-%'::text) AND ur.proposal_id = (split_part(messages.topic, '-'::text, 2))::uuid)
        OR ((messages.topic ~~ 'realtime:messages-%'::text) AND ur.proposal_id = (split_part(messages.topic, '-'::text, 2))::uuid)
        OR ((messages.topic ~~ 'realtime:visibility-locks-%'::text) AND ur.proposal_id = (split_part(messages.topic, '-'::text, 3))::uuid)
        OR ((messages.topic ~~ 'realtime:section_assignments:%'::text) AND ur.proposal_id = (split_part(messages.topic, ':'::text, 3))::uuid)
        OR ((messages.topic ~~ 'realtime:block-locks:%'::text) AND ur.proposal_id = (split_part(messages.topic, ':'::text, 3))::uuid)
        OR ((messages.topic ~~ 'realtime:section_progress:%'::text) AND ur.proposal_id = (split_part(messages.topic, ':'::text, 3))::uuid)
        OR ((messages.topic ~~ 'realtime:section_content:%'::text) AND ur.proposal_id = (split_part(messages.topic, ':'::text, 3))::uuid)
        OR ((messages.topic ~~ 'realtime:wp-drafts-nav-%'::text) AND ur.proposal_id = (split_part(messages.topic, '-'::text, 4))::uuid)
        OR ((messages.topic ~~ 'realtime:wp-themes-nav-%'::text) AND ur.proposal_id = (split_part(messages.topic, '-'::text, 4))::uuid)
        OR ((messages.topic ~~ 'realtime:proposal-themes-flag-%'::text) AND ur.proposal_id = (split_part(messages.topic, '-'::text, 4))::uuid)
        OR ((messages.topic ~~ 'realtime:case-drafts-nav-%'::text) AND ur.proposal_id = (split_part(messages.topic, '-'::text, 4))::uuid)
        OR ((messages.topic ~~ 'realtime:proposal:%:cursors'::text) AND ur.proposal_id = (split_part(messages.topic, ':'::text, 3))::uuid)
        OR ((messages.topic ~~ 'realtime:availability-%'::text) AND ur.proposal_id = (split_part(messages.topic, '-'::text, 2))::uuid)
      )
  )
);