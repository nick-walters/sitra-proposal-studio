-- 1) Storage policies for participant-logos bucket
-- Paths look like: logos/{participantId}-{timestamp}.{ext}
-- Allow INSERT/UPDATE/DELETE only to users who can edit the participant's proposal.

DROP POLICY IF EXISTS "participant_logos_insert_editors" ON storage.objects;
CREATE POLICY "participant_logos_insert_editors"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'participant-logos'
  AND (storage.foldername(name))[1] = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.id::text = split_part(split_part(name, '/', 2), '-', 1)
      AND public.can_edit_proposal(auth.uid(), p.proposal_id)
  )
);

DROP POLICY IF EXISTS "participant_logos_update_editors" ON storage.objects;
CREATE POLICY "participant_logos_update_editors"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'participant-logos'
  AND (storage.foldername(name))[1] = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.id::text = split_part(split_part(name, '/', 2), '-', 1)
      AND public.can_edit_proposal(auth.uid(), p.proposal_id)
  )
)
WITH CHECK (
  bucket_id = 'participant-logos'
  AND (storage.foldername(name))[1] = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.id::text = split_part(split_part(name, '/', 2), '-', 1)
      AND public.can_edit_proposal(auth.uid(), p.proposal_id)
  )
);

DROP POLICY IF EXISTS "participant_logos_delete_editors" ON storage.objects;
CREATE POLICY "participant_logos_delete_editors"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'participant-logos'
  AND (storage.foldername(name))[1] = 'logos'
  AND EXISTS (
    SELECT 1 FROM public.participants p
    WHERE p.id::text = split_part(split_part(name, '/', 2), '-', 1)
      AND public.can_edit_proposal(auth.uid(), p.proposal_id)
  )
);

-- 2) Tighten proposal_user_onboarding INSERT policy
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'proposal_user_onboarding' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.proposal_user_onboarding', pol.policyname);
  END LOOP;
END$$;

CREATE POLICY "Users can insert their own onboarding for proposals they belong to"
ON public.proposal_user_onboarding FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.has_any_proposal_role(auth.uid(), proposal_id)
);
