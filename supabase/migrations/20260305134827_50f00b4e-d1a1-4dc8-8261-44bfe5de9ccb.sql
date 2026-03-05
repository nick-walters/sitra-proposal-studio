
-- Table to track user onboarding per proposal
CREATE TABLE public.proposal_user_onboarding (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  onboarded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(proposal_id, user_id)
);

ALTER TABLE public.proposal_user_onboarding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own onboarding" ON public.proposal_user_onboarding
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can insert own onboarding" ON public.proposal_user_onboarding
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
