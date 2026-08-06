ALTER TABLE public.impact_canvas_columns
  ADD COLUMN IF NOT EXISTS figure_id uuid REFERENCES public.figures(id) ON DELETE CASCADE;
ALTER TABLE public.impact_canvas_rows
  ADD COLUMN IF NOT EXISTS figure_id uuid REFERENCES public.figures(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_impact_canvas_columns_figure ON public.impact_canvas_columns(figure_id);
CREATE INDEX IF NOT EXISTS idx_impact_canvas_rows_figure ON public.impact_canvas_rows(figure_id);

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS overview_canvas_enabled boolean NOT NULL DEFAULT true;

UPDATE public.proposals SET overview_canvas_enabled = false WHERE acronym ILIKE 'ADDGenAI';
UPDATE public.proposals SET overview_canvas_enabled = true WHERE acronym ILIKE 'SUSIE-Q';