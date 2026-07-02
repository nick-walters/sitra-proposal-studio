
-- Impact Canvas Phase 1a
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS impact_canvas_enabled boolean NOT NULL DEFAULT true;

-- Columns table
CREATE TABLE IF NOT EXISTS public.impact_canvas_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  key text NOT NULL,
  heading text NOT NULL DEFAULT '',
  guideline text,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.impact_canvas_columns TO authenticated;
GRANT ALL ON public.impact_canvas_columns TO service_role;
ALTER TABLE public.impact_canvas_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View impact canvas columns with proposal access"
  ON public.impact_canvas_columns FOR SELECT
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Edit impact canvas columns as editor+"
  ON public.impact_canvas_columns FOR ALL
  USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE INDEX IF NOT EXISTS idx_impact_canvas_columns_proposal
  ON public.impact_canvas_columns(proposal_id, order_index);

CREATE TRIGGER trg_impact_canvas_columns_updated
  BEFORE UPDATE ON public.impact_canvas_columns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Rows table
CREATE TABLE IF NOT EXISTS public.impact_canvas_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  order_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.impact_canvas_rows TO authenticated;
GRANT ALL ON public.impact_canvas_rows TO service_role;
ALTER TABLE public.impact_canvas_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View impact canvas rows with proposal access"
  ON public.impact_canvas_rows FOR SELECT
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Edit impact canvas rows as editor+"
  ON public.impact_canvas_rows FOR ALL
  USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE INDEX IF NOT EXISTS idx_impact_canvas_rows_proposal
  ON public.impact_canvas_rows(proposal_id, order_index);

CREATE TRIGGER trg_impact_canvas_rows_updated
  BEFORE UPDATE ON public.impact_canvas_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Idempotent seeding trigger — seeds only when the proposal has no columns yet.
CREATE OR REPLACE FUNCTION public.seed_impact_canvas_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.impact_canvas_columns WHERE proposal_id = NEW.id) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.impact_canvas_columns (proposal_id, key, heading, guideline, order_index) VALUES
    (NEW.id, 'needs',            'Specific needs',    'What are the specific needs that triggered this project?', 0),
    (NEW.id, 'target_groups',    'Target groups',     'Who will use or further up-take the results of the project? Who will benefit from the results of the project?', 1),
    (NEW.id, 'expected_results', 'Expected results',  'What do you expect to generate by the end of the project?', 2),
    (NEW.id, 'dec_measures',     'DEC measures',      'What dissemination, exploitation and communication measures will you apply to the results?', 3),
    (NEW.id, 'outcomes',         'Outcomes',          'What change do you expect to see after successful dissemination and exploitation of project results to the target group(s)?', 4),
    (NEW.id, 'impacts',          'Impacts',           'What are the expected wider scientific, economic and societal effects of the project contributing to the expected impacts outlined in the respective destination in the work programme?', 5);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_impact_canvas ON public.proposals;
CREATE TRIGGER trg_seed_impact_canvas
  AFTER INSERT ON public.proposals
  FOR EACH ROW EXECUTE FUNCTION public.seed_impact_canvas_columns();
