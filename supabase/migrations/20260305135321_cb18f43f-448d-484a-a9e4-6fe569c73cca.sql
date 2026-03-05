
-- Store unavailable dates per user per proposal
CREATE TABLE public.user_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  unavailable_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, user_id, unavailable_date)
);

ALTER TABLE public.user_availability ENABLE ROW LEVEL SECURITY;

-- Users can read availability for proposals they have a role on
CREATE POLICY "Users can read availability for their proposals" ON public.user_availability
  FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

-- Users can insert their own availability
CREATE POLICY "Users can insert own availability" ON public.user_availability
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can delete their own availability
CREATE POLICY "Users can delete own availability" ON public.user_availability
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_availability;
