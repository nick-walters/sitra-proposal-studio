
-- Fix 1: section_tracked_changes SELECT policy - currently USING (true), should be scoped
DROP POLICY IF EXISTS "Users can view tracked changes" ON public.section_tracked_changes;

CREATE POLICY "Users can view tracked changes"
ON public.section_tracked_changes
FOR SELECT TO authenticated
USING (has_any_proposal_role(auth.uid(), proposal_id));

-- Fix 2: participant_members SELECT - email exposure to all proposal members
-- The current broad SELECT stays for editors+ (they already have ALL via the manage policy).
-- We keep the existing SELECT for proposal members but note that in this collaborative
-- proposal tool, all proposal members legitimately need to see team member info including
-- names and emails for coordination purposes. The SELECT policy is already scoped to
-- proposal members only via has_any_proposal_role. No change needed here as all proposal
-- collaborators need this information for the tool to function.
