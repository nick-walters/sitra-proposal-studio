ALTER TABLE public.impact_canvas_elements
  ADD COLUMN IF NOT EXISTS figure_id uuid NULL
  REFERENCES public.figures(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS impact_canvas_elements_figure_idx
  ON public.impact_canvas_elements(figure_id);
