CREATE TABLE public.methodology_linked_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  acronym text NOT NULL DEFAULT '',
  instrument_code text CHECK (instrument_code IN ('HE','DEU','RCF','OTHER')),
  instrument_custom text,
  duration_start int,
  duration_end int,
  link_description_html text,
  responsible_participant_id uuid REFERENCES public.participants(id) ON DELETE SET NULL,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.methodology_linked_activities TO authenticated;
GRANT ALL ON public.methodology_linked_activities TO service_role;

ALTER TABLE public.methodology_linked_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View linked activities with proposal access"
  ON public.methodology_linked_activities FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Insert linked activities when editor"
  ON public.methodology_linked_activities FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Update linked activities when editor"
  ON public.methodology_linked_activities FOR UPDATE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Delete linked activities when editor"
  ON public.methodology_linked_activities FOR DELETE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE INDEX idx_methodology_linked_activities_proposal_order
  ON public.methodology_linked_activities (proposal_id, order_index);

CREATE TRIGGER update_methodology_linked_activities_updated_at
  BEFORE UPDATE ON public.methodology_linked_activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();