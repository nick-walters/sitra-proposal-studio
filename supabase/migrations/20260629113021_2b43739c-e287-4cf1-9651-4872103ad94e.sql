
-- 1) profiles: revoke column-level SELECT of sensitive PII from authenticated
REVOKE SELECT (phone_number, country_code, address, address_line_2, postcode, city, gdpr_consented_at)
  ON public.profiles FROM authenticated;

-- Keep the existing "Co-members can view profiles" row policy but drop the now-redundant coordinator full-profile policy
DROP POLICY IF EXISTS "Coordinators can view co-member full profiles" ON public.profiles;

-- 2) section_tracked_changes: enforce authorship
DROP POLICY IF EXISTS "Proposal editors can create tracked changes" ON public.section_tracked_changes;
CREATE POLICY "Proposal editors can create tracked changes"
  ON public.section_tracked_changes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    can_edit_proposal(auth.uid(), proposal_id)
    AND author_id = auth.uid()
  );

DROP POLICY IF EXISTS "Proposal editors can delete tracked changes" ON public.section_tracked_changes;
CREATE POLICY "Proposal editors can delete tracked changes"
  ON public.section_tracked_changes
  FOR DELETE
  TO authenticated
  USING (
    (author_id = auth.uid() AND can_edit_proposal(auth.uid(), proposal_id))
    OR is_proposal_admin(auth.uid(), proposal_id)
  );

DROP POLICY IF EXISTS "Proposal editors can update tracked changes" ON public.section_tracked_changes;
CREATE POLICY "Proposal editors can update tracked changes"
  ON public.section_tracked_changes
  FOR UPDATE
  TO authenticated
  USING (
    (author_id = auth.uid() AND can_edit_proposal(auth.uid(), proposal_id))
    OR is_proposal_admin(auth.uid(), proposal_id)
  )
  WITH CHECK (
    (author_id = auth.uid() AND can_edit_proposal(auth.uid(), proposal_id))
    OR is_proposal_admin(auth.uid(), proposal_id)
  );

-- 3) realtime.messages: replace POSITION substring check with anchored token match
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
        AND messages.topic ~ ('(^|[^0-9a-fA-F])' || (ur.proposal_id)::text || '($|[^0-9a-fA-F])')
    )
  );
