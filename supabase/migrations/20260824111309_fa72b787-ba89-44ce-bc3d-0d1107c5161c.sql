CREATE TABLE public.ui_collapse_states (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  card_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, proposal_id, card_key)
);

GRANT SELECT, INSERT, DELETE ON public.ui_collapse_states TO authenticated;
GRANT ALL ON public.ui_collapse_states TO service_role;

ALTER TABLE public.ui_collapse_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own collapse preferences"
  ON public.ui_collapse_states FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users set their own collapse preferences"
  ON public.ui_collapse_states FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Users clear their own collapse preferences"
  ON public.ui_collapse_states FOR DELETE TO authenticated
  USING (user_id = auth.uid());