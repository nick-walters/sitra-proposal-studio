
-- Create impact_canvas_elements table for freeform canvas layout
CREATE TABLE public.impact_canvas_elements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('bound','shape','arrow','icon','image','text')),
  bound_row_id uuid REFERENCES public.impact_canvas_rows(id) ON DELETE CASCADE,
  bound_col_key text,
  x numeric NOT NULL DEFAULT 0,
  y numeric NOT NULL DEFAULT 0,
  w numeric NOT NULL DEFAULT 0,
  h numeric NOT NULL DEFAULT 0,
  z integer NOT NULL DEFAULT 0,
  rotation numeric NOT NULL DEFAULT 0,
  style jsonb NOT NULL DEFAULT '{}'::jsonb,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX impact_canvas_elements_bound_unique
  ON public.impact_canvas_elements (proposal_id, bound_row_id, bound_col_key)
  WHERE bound_row_id IS NOT NULL AND bound_col_key IS NOT NULL;

CREATE INDEX impact_canvas_elements_proposal_idx
  ON public.impact_canvas_elements (proposal_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.impact_canvas_elements TO authenticated;
GRANT ALL ON public.impact_canvas_elements TO service_role;

ALTER TABLE public.impact_canvas_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View impact canvas elements with proposal access"
  ON public.impact_canvas_elements FOR SELECT
  USING (has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Edit impact canvas elements as editor+"
  ON public.impact_canvas_elements FOR ALL
  USING (can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (can_edit_proposal(auth.uid(), proposal_id));

CREATE TRIGGER impact_canvas_elements_updated_at
  BEFORE UPDATE ON public.impact_canvas_elements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill: one 'bound' element per (row × column) at grid-matching default coords.
-- Logical viewport: 1000 x 600; header row: 60 units.
WITH cols AS (
  SELECT proposal_id, id AS col_id, key AS col_key, order_index AS col_idx,
         COUNT(*) OVER (PARTITION BY proposal_id) AS n_cols
  FROM public.impact_canvas_columns
),
rows_ AS (
  SELECT proposal_id, id AS row_id, order_index AS row_idx,
         COUNT(*) OVER (PARTITION BY proposal_id) AS n_rows
  FROM public.impact_canvas_rows
),
cells AS (
  SELECT r.proposal_id, r.row_id, c.col_key,
         (c.col_idx::numeric * (1000.0 / NULLIF(c.n_cols,0)))                       AS x,
         (60.0 + r.row_idx::numeric * (540.0 / NULLIF(r.n_rows,0)))                 AS y,
         (1000.0 / NULLIF(c.n_cols,0))                                              AS w,
         (540.0  / NULLIF(r.n_rows,0))                                              AS h
  FROM rows_ r
  JOIN cols c ON c.proposal_id = r.proposal_id
)
INSERT INTO public.impact_canvas_elements
  (proposal_id, kind, bound_row_id, bound_col_key, x, y, w, h)
SELECT proposal_id, 'bound', row_id, col_key, x, y, w, h
FROM cells
ON CONFLICT DO NOTHING;
