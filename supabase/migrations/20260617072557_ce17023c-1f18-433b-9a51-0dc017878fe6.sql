
-- 1. ethics_assessment: split ALL policy into per-action policies
DROP POLICY IF EXISTS "All proposal members can manage ethics" ON public.ethics_assessment;

CREATE POLICY "Editors can insert ethics assessment"
ON public.ethics_assessment FOR INSERT TO authenticated
WITH CHECK (can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Editors can update ethics assessment"
ON public.ethics_assessment FOR UPDATE TO authenticated
USING (can_edit_proposal(auth.uid(), proposal_id))
WITH CHECK (can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Editors can delete ethics assessment"
ON public.ethics_assessment FOR DELETE TO authenticated
USING (can_edit_proposal(auth.uid(), proposal_id));

-- 2. participant_researchers: restrict SELECT to editors (personal data)
DROP POLICY IF EXISTS "Users can view researchers for accessible proposals" ON public.participant_researchers;

CREATE POLICY "Editors can view researchers"
ON public.participant_researchers FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.participants p
  WHERE p.id = participant_researchers.participant_id
    AND can_edit_proposal(auth.uid(), p.proposal_id)
));

-- 3. proposal-files storage: use can_edit_proposal helper
DROP POLICY IF EXISTS "Proposal members can upload proposal files" ON storage.objects;
DROP POLICY IF EXISTS "Proposal members can update proposal files" ON storage.objects;
DROP POLICY IF EXISTS "Proposal members can delete proposal files" ON storage.objects;

CREATE POLICY "Editors can upload proposal files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'proposal-files'
  AND can_edit_proposal(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Editors can update proposal files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'proposal-files'
  AND can_edit_proposal(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Editors can delete proposal files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'proposal-files'
  AND can_edit_proposal(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

-- 4. snippet_library: scope policies to authenticated role
DROP POLICY IF EXISTS "Coordinators and admins can view snippets" ON public.snippet_library;
DROP POLICY IF EXISTS "Coordinators and admins can create snippets" ON public.snippet_library;
DROP POLICY IF EXISTS "Coordinators and admins can update own snippets" ON public.snippet_library;
DROP POLICY IF EXISTS "Coordinators and admins can delete own snippets" ON public.snippet_library;

CREATE POLICY "Coordinators and admins can view snippets"
ON public.snippet_library FOR SELECT TO authenticated
USING (is_coordinator_or_above(auth.uid()));

CREATE POLICY "Coordinators and admins can create snippets"
ON public.snippet_library FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by AND is_coordinator_or_above(auth.uid()));

CREATE POLICY "Coordinators and admins can update own snippets"
ON public.snippet_library FOR UPDATE TO authenticated
USING (auth.uid() = created_by AND is_coordinator_or_above(auth.uid()))
WITH CHECK (auth.uid() = created_by AND is_coordinator_or_above(auth.uid()));

CREATE POLICY "Coordinators and admins can delete own snippets"
ON public.snippet_library FOR DELETE TO authenticated
USING (auth.uid() = created_by AND is_coordinator_or_above(auth.uid()));
