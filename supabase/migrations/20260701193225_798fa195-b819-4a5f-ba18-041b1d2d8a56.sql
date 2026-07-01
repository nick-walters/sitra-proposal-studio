
CREATE TABLE public.participant_descriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  contribution_resources text,
  value_chain text,
  industrial_involvement text,
  participation_justification text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, participant_id)
);

CREATE INDEX participant_descriptions_proposal_participant_idx
  ON public.participant_descriptions (proposal_id, participant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.participant_descriptions TO authenticated;
GRANT ALL ON public.participant_descriptions TO service_role;

ALTER TABLE public.participant_descriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View participant descriptions for proposals with access"
  ON public.participant_descriptions FOR SELECT
  USING (has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Editors can insert participant descriptions"
  ON public.participant_descriptions FOR INSERT
  WITH CHECK (can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Editors can update participant descriptions"
  ON public.participant_descriptions FOR UPDATE
  USING (can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Editors can delete participant descriptions"
  ON public.participant_descriptions FOR DELETE
  USING (can_edit_proposal(auth.uid(), proposal_id));

CREATE TRIGGER update_participant_descriptions_updated_at
  BEFORE UPDATE ON public.participant_descriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
