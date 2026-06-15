
-- 1. AI platform config: restrict SELECT to global admins
DROP POLICY IF EXISTS "Anyone authenticated can view AI platform config" ON public.ai_platform_config;
CREATE POLICY "Global admins can view AI platform config"
ON public.ai_platform_config
FOR SELECT TO authenticated
USING (public.is_global_admin(auth.uid()));

-- 2. participant_ocd_uploads: restrict UPDATE to proposal admins
DROP POLICY IF EXISTS "ocd_uploads_update" ON public.participant_ocd_uploads;
CREATE POLICY "ocd_uploads_update"
ON public.participant_ocd_uploads
FOR UPDATE TO authenticated
USING (public.is_proposal_admin(auth.uid(), proposal_id))
WITH CHECK (public.is_proposal_admin(auth.uid(), proposal_id));

-- 3. participant_researchers: switch roles from public to authenticated
DROP POLICY IF EXISTS "Users can manage researchers for editable proposals" ON public.participant_researchers;
DROP POLICY IF EXISTS "Users can view researchers for accessible proposals" ON public.participant_researchers;

CREATE POLICY "Users can view researchers for accessible proposals"
ON public.participant_researchers
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.participants p
  WHERE p.id = participant_researchers.participant_id
    AND public.has_any_proposal_role(auth.uid(), p.proposal_id)
));

CREATE POLICY "Users can manage researchers for editable proposals"
ON public.participant_researchers
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.participants p
  WHERE p.id = participant_researchers.participant_id
    AND public.can_edit_proposal(auth.uid(), p.proposal_id)
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.participants p
  WHERE p.id = participant_researchers.participant_id
    AND public.can_edit_proposal(auth.uid(), p.proposal_id)
));

-- 4. Storage: participant-logos writes are server-only (edge function uses service role)
DROP POLICY IF EXISTS "Proposal members can upload participant logos" ON storage.objects;
DROP POLICY IF EXISTS "Proposal members can update participant logos" ON storage.objects;
DROP POLICY IF EXISTS "Proposal members can delete participant logos" ON storage.objects;
-- No client write policies are recreated; service_role bypasses RLS. SELECT remains (bucket is public).

-- 5. Realtime: tighten topic subscription policy
DROP POLICY IF EXISTS "Authenticated users can receive realtime messages for their cha" ON realtime.messages;

CREATE POLICY "Authenticated users can receive realtime messages for their cha"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  is_global_admin(auth.uid())
  OR topic = 'realtime:notifications'::text
  OR topic = 'realtime:profile-name-check'::text
  -- Scoped: proposals-realtime requires having any proposal role
  OR (
    topic = 'realtime:proposals-realtime'::text
    AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())
  )
  -- Scoped: feedback-comments-{feedbackId} requires being the feedback owner
  OR (
    topic ~~ 'realtime:feedback-comments-%'::text
    AND EXISTS (
      SELECT 1 FROM public.feedback f
      WHERE f.id = (substring(topic from 'realtime:feedback-comments-(.*)'))::uuid
        AND f.user_id = auth.uid()
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND (
        ((messages.topic ~~ 'realtime:comments:%'::text) AND (ur.proposal_id = (split_part(messages.topic, ':'::text, 3))::uuid))
        OR ((messages.topic ~~ 'realtime:references-%'::text) AND (ur.proposal_id = (split_part(messages.topic, '-'::text, 2))::uuid))
        OR ((messages.topic ~~ 'realtime:messages-%'::text) AND (ur.proposal_id = (split_part(messages.topic, '-'::text, 2))::uuid))
        OR ((messages.topic ~~ 'realtime:visibility-locks-%'::text) AND (ur.proposal_id = (split_part(messages.topic, '-'::text, 3))::uuid))
        OR ((messages.topic ~~ 'realtime:section_assignments:%'::text) AND (ur.proposal_id = (split_part(messages.topic, ':'::text, 3))::uuid))
        OR ((messages.topic ~~ 'realtime:block-locks:%'::text) AND (ur.proposal_id = (split_part(messages.topic, ':'::text, 3))::uuid))
        OR ((messages.topic ~~ 'realtime:section_progress:%'::text) AND (ur.proposal_id = (split_part(messages.topic, ':'::text, 3))::uuid))
        OR ((messages.topic ~~ 'realtime:section_content:%'::text) AND (ur.proposal_id = (split_part(messages.topic, ':'::text, 3))::uuid))
        OR ((messages.topic ~~ 'realtime:wp-drafts-nav-%'::text) AND (ur.proposal_id = (split_part(messages.topic, '-'::text, 4))::uuid))
        OR ((messages.topic ~~ 'realtime:wp-themes-nav-%'::text) AND (ur.proposal_id = (split_part(messages.topic, '-'::text, 4))::uuid))
        OR ((messages.topic ~~ 'realtime:proposal-themes-flag-%'::text) AND (ur.proposal_id = (split_part(messages.topic, '-'::text, 4))::uuid))
        OR ((messages.topic ~~ 'realtime:case-drafts-nav-%'::text) AND (ur.proposal_id = (split_part(messages.topic, '-'::text, 4))::uuid))
        OR ((messages.topic ~~ 'realtime:proposal:%:cursors'::text) AND (ur.proposal_id = (split_part(messages.topic, ':'::text, 3))::uuid))
        OR ((messages.topic ~~ 'realtime:availability-%'::text) AND (ur.proposal_id = (split_part(messages.topic, '-'::text, 2))::uuid))
      )
  )
);
