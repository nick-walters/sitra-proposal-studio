-- 1. Remove the overly permissive public SELECT policy on proposal-files storage
DROP POLICY IF EXISTS "Proposal files are publicly accessible" ON storage.objects;

-- 2. Fix b31_deliverables RLS policies - replace weak "proposal exists" checks with proper role checks
DROP POLICY IF EXISTS "Users can view deliverables for proposals they have access to" ON public.b31_deliverables;
DROP POLICY IF EXISTS "Users can insert deliverables" ON public.b31_deliverables;
DROP POLICY IF EXISTS "Users can update deliverables" ON public.b31_deliverables;
DROP POLICY IF EXISTS "Users can delete deliverables" ON public.b31_deliverables;

CREATE POLICY "Users can view deliverables for proposals they have access to"
ON public.b31_deliverables FOR SELECT
TO public
USING (has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Users can insert deliverables"
ON public.b31_deliverables FOR INSERT
TO public
WITH CHECK (can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Users can update deliverables"
ON public.b31_deliverables FOR UPDATE
TO public
USING (can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Users can delete deliverables"
ON public.b31_deliverables FOR DELETE
TO public
USING (can_edit_proposal(auth.uid(), proposal_id));

-- 3. Remove the privilege escalation policy on user_roles
DROP POLICY IF EXISTS "Users can add own proposal roles" ON public.user_roles;