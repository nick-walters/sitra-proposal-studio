CREATE TABLE IF NOT EXISTS public.methodology_subsections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  key text NOT NULL,
  title text NOT NULL DEFAULT '',
  order_index int NOT NULL DEFAULT 0,
  is_visible boolean NOT NULL DEFAULT true,
  content_html text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id, key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.methodology_subsections TO authenticated;
GRANT ALL ON public.methodology_subsections TO service_role;
ALTER TABLE public.methodology_subsections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View methodology subsections with proposal access"
  ON public.methodology_subsections FOR SELECT
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Edit methodology subsections as editor+"
  ON public.methodology_subsections FOR ALL
  USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE INDEX IF NOT EXISTS idx_methodology_subsections_proposal
  ON public.methodology_subsections(proposal_id, order_index);

CREATE TRIGGER trg_methodology_subsections_updated
  BEFORE UPDATE ON public.methodology_subsections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.seed_methodology_subsections()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.methodology_subsections WHERE proposal_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.methodology_subsections (proposal_id, key, title, order_index) VALUES
    (NEW.id, 'concepts',            'Underlying concepts, models & assumptions', 0),
    (NEW.id, 'methodologies',       'Methodologies', 1),
    (NEW.id, 'linked_activities',   'Linked research & innovation activities', 2),
    (NEW.id, 'interdisciplinarity', 'Interdisciplinarity', 3),
    (NEW.id, 'ssh',                 'Social sciences & humanities', 4),
    (NEW.id, 'gender',              'Gender dimension', 5),
    (NEW.id, 'open_science',        'Open science practices', 6)
  ON CONFLICT (proposal_id, key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_methodology_subsections ON public.proposals;
CREATE TRIGGER trg_seed_methodology_subsections
  AFTER INSERT ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.seed_methodology_subsections();

INSERT INTO public.methodology_subsections (proposal_id, key, title, order_index)
SELECT p.id, s.key, s.title, s.order_index
FROM public.proposals p
CROSS JOIN (VALUES
  ('concepts',            'Underlying concepts, models & assumptions', 0),
  ('methodologies',       'Methodologies', 1),
  ('linked_activities',   'Linked research & innovation activities', 2),
  ('interdisciplinarity', 'Interdisciplinarity', 3),
  ('ssh',                 'Social sciences & humanities', 4),
  ('gender',              'Gender dimension', 5),
  ('open_science',        'Open science practices', 6)
) AS s(key, title, order_index)
ON CONFLICT (proposal_id, key) DO NOTHING;