-- `citation_number` was never a display number: it is a permanent internal id
-- minted when a reference joins the library, and the number a reader sees is
-- derived from citation order. The name has caused repeated confusion, so the
-- table and column are renamed to say what they are.
ALTER TABLE public."references" RENAME TO proposal_references;
ALTER TABLE public.proposal_references RENAME COLUMN citation_number TO ref_key;

-- A DERIVED index of where each reference is cited. The authoritative anchor
-- remains the <sup data-citation="…"> node inside the field HTML; these rows
-- are rewritten by a debounced reconciler whenever that HTML is saved, so
-- copy, paste and undo keep working on the HTML alone.
CREATE TABLE public.citation_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  reference_id uuid NOT NULL REFERENCES public.proposal_references(id) ON DELETE CASCADE,
  field_id uuid REFERENCES public.card_fields(id) ON DELETE CASCADE,
  card_id uuid REFERENCES public.proposal_cards(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Exactly one anchor. `card_id` is denormalised from the field for cheap
  -- per-block reconciliation, so it may accompany a field anchor, but an
  -- instance must be anchored to a field or to a block, never to neither.
  CONSTRAINT citation_instances_one_anchor CHECK (
    (field_id IS NOT NULL) <> (field_id IS NULL AND card_id IS NOT NULL)
  )
);

CREATE INDEX citation_instances_proposal_idx ON public.citation_instances (proposal_id);
CREATE INDEX citation_instances_field_idx ON public.citation_instances (field_id);
CREATE INDEX citation_instances_card_idx ON public.citation_instances (card_id);
CREATE INDEX citation_instances_reference_idx ON public.citation_instances (reference_id);

GRANT SELECT, INSERT, UPDATE ON public.citation_instances TO authenticated;
GRANT ALL ON public.citation_instances TO service_role;

ALTER TABLE public.citation_instances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view citation instances"
  ON public.citation_instances FOR SELECT TO authenticated
  USING (has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Editors can insert citation instances"
  ON public.citation_instances FOR INSERT TO authenticated
  WITH CHECK (can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Editors can update citation instances"
  ON public.citation_instances FOR UPDATE TO authenticated
  USING (can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (can_edit_proposal(auth.uid(), proposal_id));

CREATE TRIGGER citation_instances_updated_at
  BEFORE UPDATE ON public.citation_instances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();