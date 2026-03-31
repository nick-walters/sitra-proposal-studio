
CREATE TABLE public.effort_row_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  locked_by uuid NOT NULL REFERENCES auth.users(id),
  locked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, participant_id)
);

ALTER TABLE public.effort_row_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with proposal role can view effort locks"
  ON public.effort_row_locks FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Coordinators+ can manage effort locks"
  ON public.effort_row_locks FOR ALL TO authenticated
  USING (public.is_proposal_admin(auth.uid(), proposal_id))
  WITH CHECK (public.is_proposal_admin(auth.uid(), proposal_id));
