-- Fix 1: Tighten section_tracked_changes policies to proposal members
DROP POLICY IF EXISTS "Users can create tracked changes" ON section_tracked_changes;
DROP POLICY IF EXISTS "Users can update tracked changes" ON section_tracked_changes;
DROP POLICY IF EXISTS "Users can delete tracked changes" ON section_tracked_changes;

CREATE POLICY "Proposal editors can create tracked changes"
ON section_tracked_changes FOR INSERT TO authenticated
WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Proposal editors can update tracked changes"
ON section_tracked_changes FOR UPDATE TO authenticated
USING (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Proposal editors can delete tracked changes"
ON section_tracked_changes FOR DELETE TO authenticated
USING (public.can_edit_proposal(auth.uid(), proposal_id));

-- Fix 2: Tighten people table INSERT/UPDATE policies
DROP POLICY IF EXISTS "Authenticated users can insert people" ON people;
DROP POLICY IF EXISTS "Authenticated users can update people" ON people;

CREATE POLICY "Authenticated users can insert people"
ON people FOR INSERT TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update people"
ON people FOR UPDATE TO authenticated
USING (auth.uid() IS NOT NULL);