
-- Stars table for per-user message starring
CREATE TABLE public.message_stars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.proposal_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

ALTER TABLE public.message_stars ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own stars"
  ON public.message_stars FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can star messages"
  ON public.message_stars FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can unstar messages"
  ON public.message_stars FOR DELETE
  USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.message_stars;
