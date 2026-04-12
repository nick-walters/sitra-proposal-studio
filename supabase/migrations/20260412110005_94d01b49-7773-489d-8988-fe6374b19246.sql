
-- Enable RLS on realtime.messages (it may already be enabled)
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to receive realtime messages
-- Channel topics in Supabase Realtime use the format: realtime:{channel_name}
-- We scope access based on proposal membership or user-specific channels
CREATE POLICY "Authenticated users can receive realtime messages for their channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Allow notifications (user-specific, filtered by user_id in the subscription)
  topic = 'realtime:notifications'
  -- Allow profile name check
  OR topic = 'realtime:profile-name-check'
  -- Allow proposals-realtime (dashboard - filtered client-side by user roles)
  OR topic = 'realtime:proposals-realtime'
  -- Allow feedback channels (all authenticated users can view feedback)
  OR topic LIKE 'realtime:feedback-comments-%'
  -- Allow proposal-scoped channels only if user has a role on the proposal
  OR (
    -- Extract proposal ID from various topic patterns and check membership
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND (
          -- Pattern: realtime:comments:{proposalId}:{sectionId}
          (topic LIKE 'realtime:comments:%' AND ur.proposal_id = split_part(topic, ':', 3)::uuid)
          -- Pattern: realtime:references-{proposalId}
          OR (topic LIKE 'realtime:references-%' AND ur.proposal_id = split_part(topic, '-', 2)::uuid)
          -- Pattern: realtime:messages-{proposalId}
          OR (topic LIKE 'realtime:messages-%' AND ur.proposal_id = split_part(topic, '-', 2)::uuid)
          -- Pattern: realtime:visibility-locks-{proposalId}
          OR (topic LIKE 'realtime:visibility-locks-%' AND ur.proposal_id = split_part(topic, '-', 3)::uuid)
          -- Pattern: realtime:section_assignments:{proposalId}
          OR (topic LIKE 'realtime:section_assignments:%' AND ur.proposal_id = split_part(topic, ':', 3)::uuid)
          -- Pattern: realtime:block-locks:{proposalId}:{sectionId}
          OR (topic LIKE 'realtime:block-locks:%' AND ur.proposal_id = split_part(topic, ':', 3)::uuid)
          -- Pattern: realtime:section_progress:{proposalId}
          OR (topic LIKE 'realtime:section_progress:%' AND ur.proposal_id = split_part(topic, ':', 3)::uuid)
          -- Pattern: realtime:section_content:{proposalId}:{sectionId}
          OR (topic LIKE 'realtime:section_content:%' AND ur.proposal_id = split_part(topic, ':', 3)::uuid)
          -- Pattern: realtime:wp-drafts-nav-{proposalId}
          OR (topic LIKE 'realtime:wp-drafts-nav-%' AND ur.proposal_id = split_part(topic, '-', 4)::uuid)
          -- Pattern: realtime:wp-themes-nav-{proposalId}
          OR (topic LIKE 'realtime:wp-themes-nav-%' AND ur.proposal_id = split_part(topic, '-', 4)::uuid)
          -- Pattern: realtime:proposal-themes-flag-{proposalId}
          OR (topic LIKE 'realtime:proposal-themes-flag-%' AND ur.proposal_id = split_part(topic, '-', 4)::uuid)
          -- Pattern: realtime:case-drafts-nav-{proposalId}
          OR (topic LIKE 'realtime:case-drafts-nav-%' AND ur.proposal_id = split_part(topic, '-', 4)::uuid)
          -- Pattern: realtime:proposal:{proposalId}:cursors
          OR (topic LIKE 'realtime:proposal:%:cursors' AND ur.proposal_id = split_part(topic, ':', 3)::uuid)
          -- Pattern: realtime:availability-{proposalId}
          OR (topic LIKE 'realtime:availability-%' AND ur.proposal_id = split_part(topic, '-', 2)::uuid)
        )
    )
  )
  -- Global admins can access everything
  OR public.is_global_admin(auth.uid())
);
