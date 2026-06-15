
-- 1) Tighten RLS on public.people
DROP POLICY IF EXISTS "Authenticated users can read people" ON public.people;
DROP POLICY IF EXISTS "Authenticated users can update people" ON public.people;

CREATE POLICY "Users can view people linked to their proposals"
  ON public.people
  FOR SELECT
  TO authenticated
  USING (
    public.is_global_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.participant_members pm
      JOIN public.participants p ON p.id = pm.participant_id
      WHERE pm.person_id = people.id
        AND public.has_any_proposal_role(auth.uid(), p.proposal_id)
    )
  );

CREATE POLICY "Proposal admins can update linked people"
  ON public.people
  FOR UPDATE
  TO authenticated
  USING (
    public.is_global_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.participant_members pm
      JOIN public.participants p ON p.id = pm.participant_id
      WHERE pm.person_id = people.id
        AND public.is_proposal_admin(auth.uid(), p.proposal_id)
    )
  )
  WITH CHECK (
    public.is_global_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.participant_members pm
      JOIN public.participants p ON p.id = pm.participant_id
      WHERE pm.person_id = people.id
        AND public.is_proposal_admin(auth.uid(), p.proposal_id)
    )
  );

-- 2) Revoke anon EXECUTE on internal trigger function
REVOKE EXECUTE ON FUNCTION public.allow_section_version_cascade() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.allow_section_version_cascade() FROM anon;
REVOKE EXECUTE ON FUNCTION public.allow_section_version_cascade() FROM authenticated;
