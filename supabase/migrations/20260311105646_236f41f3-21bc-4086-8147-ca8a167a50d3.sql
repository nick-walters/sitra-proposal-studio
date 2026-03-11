
DROP TABLE IF EXISTS public.fstp_content;

CREATE TABLE public.fstp_content (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id UUID NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  instructions_text TEXT NOT NULL DEFAULT '',
  response_content TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(proposal_id)
);

ALTER TABLE public.fstp_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with proposal role can view FSTP content"
  ON public.fstp_content
  FOR SELECT
  TO authenticated
  USING (
    public.has_any_proposal_role(proposal_id, auth.uid())
  );

CREATE POLICY "Coordinators can insert FSTP content"
  ON public.fstp_content
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_proposal_role(auth.uid(), proposal_id, 'coordinator'::app_role)
    OR public.is_global_admin(auth.uid())
  );

CREATE POLICY "Coordinators can update FSTP content"
  ON public.fstp_content
  FOR UPDATE
  TO authenticated
  USING (
    public.has_proposal_role(auth.uid(), proposal_id, 'coordinator'::app_role)
    OR public.is_global_admin(auth.uid())
  )
  WITH CHECK (
    public.has_proposal_role(auth.uid(), proposal_id, 'coordinator'::app_role)
    OR public.is_global_admin(auth.uid())
  );
