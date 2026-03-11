-- Fix SELECT policy: arguments were swapped
DROP POLICY "Users with proposal role can view FSTP content" ON public.fstp_content;
CREATE POLICY "Users with proposal role can view FSTP content"
  ON public.fstp_content FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

-- Fix INSERT policy: allow editors and owners too
DROP POLICY "Coordinators can insert FSTP content" ON public.fstp_content;
CREATE POLICY "Editors can insert FSTP content"
  ON public.fstp_content FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

-- Fix UPDATE policy: allow editors and owners too  
DROP POLICY "Coordinators can update FSTP content" ON public.fstp_content;
CREATE POLICY "Editors can update FSTP content"
  ON public.fstp_content FOR UPDATE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));