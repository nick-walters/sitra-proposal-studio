
-- Simple table for section visibility locks
CREATE TABLE public.section_visibility_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  section_id text NOT NULL,
  locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, section_id)
);

ALTER TABLE public.section_visibility_locks ENABLE ROW LEVEL SECURITY;

-- Anyone with a proposal role can read locks
CREATE POLICY "Users can read visibility locks" ON public.section_visibility_locks
  FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

-- Only coordinators/admins/owners can insert
CREATE POLICY "Coordinators can insert visibility locks" ON public.section_visibility_locks
  FOR INSERT TO authenticated
  WITH CHECK (public.is_proposal_admin(auth.uid(), proposal_id));

-- Only coordinators/admins/owners can delete
CREATE POLICY "Coordinators can delete visibility locks" ON public.section_visibility_locks
  FOR DELETE TO authenticated
  USING (public.is_proposal_admin(auth.uid(), proposal_id));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.section_visibility_locks;
