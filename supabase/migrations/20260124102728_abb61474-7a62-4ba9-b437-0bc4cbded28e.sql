-- Fix RLS policy for section_comments - correct parameter order for has_any_proposal_role
DROP POLICY IF EXISTS "Users with proposal access can view comments" ON public.section_comments;

CREATE POLICY "Users with proposal access can view comments"
ON public.section_comments
FOR SELECT
USING (public.has_any_proposal_role(auth.uid(), proposal_id));

-- Also fix can_edit_proposal and is_proposal_admin calls
DROP POLICY IF EXISTS "Users with edit access can create comments" ON public.section_comments;
DROP POLICY IF EXISTS "Users can update their own comments" ON public.section_comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.section_comments;

CREATE POLICY "Users with edit access can create comments"
ON public.section_comments
FOR INSERT
WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Users can update their own comments"
ON public.section_comments
FOR UPDATE
USING (user_id = auth.uid() OR public.is_proposal_admin(auth.uid(), proposal_id));

CREATE POLICY "Users can delete their own comments"
ON public.section_comments
FOR DELETE
USING (user_id = auth.uid() OR public.is_proposal_admin(auth.uid(), proposal_id));