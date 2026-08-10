CREATE TABLE IF NOT EXISTS public.methodology_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'methodology' CHECK (kind IN ('methodology', 'case_placeholder')),
  case_type_id uuid REFERENCES public.proposal_case_types(id) ON DELETE CASCADE,
  heading text NOT NULL DEFAULT '',
  content_html text,
  assigned_participant_id uuid REFERENCES public.participants(id) ON DELETE SET NULL,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.methodology_items TO authenticated;
GRANT ALL ON public.methodology_items TO service_role;
ALTER TABLE public.methodology_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View methodology items with proposal access"
  ON public.methodology_items FOR SELECT
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Edit methodology items as editor+"
  ON public.methodology_items FOR ALL
  USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE INDEX IF NOT EXISTS idx_methodology_items_proposal
  ON public.methodology_items(proposal_id, order_index);

CREATE UNIQUE INDEX IF NOT EXISTS idx_methodology_items_case_placeholder
  ON public.methodology_items(proposal_id, case_type_id)
  WHERE kind = 'case_placeholder';

CREATE TRIGGER trg_methodology_items_updated
  BEFORE UPDATE ON public.methodology_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();