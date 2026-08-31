DROP POLICY IF EXISTS "Authenticated users can receive realtime messages for their cha" ON realtime.messages;

CREATE POLICY "Authenticated users can receive realtime messages for their cha"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_global_admin(auth.uid())
  -- Per-user topics: only the owner of the uid in the topic name may subscribe.
  OR topic = ('realtime:notifications:' || auth.uid()::text)
  OR topic = ('realtime:profile-name-check:' || auth.uid()::text)
  -- Feedback comment threads: only the author of the feedback item.
  OR (
    topic LIKE 'realtime:feedback-comments-%'
    AND EXISTS (
      SELECT 1 FROM public.feedback f
      WHERE f.id = (substring(realtime.messages.topic, 'realtime:feedback-comments-(.*)'))::uuid
        AND f.user_id = auth.uid()
    )
  )
  -- Per-proposal topics: only users holding a role on that specific proposal.
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.proposal_id IS NOT NULL
      AND (
        realtime.messages.topic = ('realtime:proposals-realtime:' || ur.proposal_id::text)
        OR realtime.messages.topic = ('realtime:visibility-locks-' || ur.proposal_id::text)
        OR realtime.messages.topic = ('realtime:section_assignments:' || ur.proposal_id::text)
        OR realtime.messages.topic = ('realtime:references-' || ur.proposal_id::text)
        OR realtime.messages.topic = ('realtime:section_content-cite-' || ur.proposal_id::text)
        OR realtime.messages.topic = ('realtime:b11-participants-' || ur.proposal_id::text)
        OR realtime.messages.topic = ('realtime:availability-' || ur.proposal_id::text)
        OR realtime.messages.topic = ('realtime:messages-' || ur.proposal_id::text)
        OR realtime.messages.topic = ('realtime:proposal:' || ur.proposal_id::text || ':cursors')
        OR realtime.messages.topic LIKE ('realtime:section_content:' || ur.proposal_id::text || ':%')
        OR realtime.messages.topic LIKE ('realtime:comments:' || ur.proposal_id::text || ':%')
        OR realtime.messages.topic LIKE ('realtime:block-locks:' || ur.proposal_id::text || ':%')
        OR realtime.messages.topic LIKE ('realtime:wp-drafts-nav-' || ur.proposal_id::text || '-%')
        OR realtime.messages.topic LIKE ('realtime:wp-themes-nav-' || ur.proposal_id::text || '-%')
        OR realtime.messages.topic LIKE ('realtime:proposal-themes-flag-' || ur.proposal_id::text || '-%')
        OR realtime.messages.topic LIKE ('realtime:case-drafts-nav-' || ur.proposal_id::text || '-%')
      )
  )
);