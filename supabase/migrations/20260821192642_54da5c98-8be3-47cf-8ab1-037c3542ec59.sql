-- A figure can be placed in at most one block. Enforced in the database so no
-- client path can double-place an asset.
CREATE UNIQUE INDEX IF NOT EXISTS card_figure_figure_id_unique
  ON public.card_figure (figure_id)
  WHERE figure_id IS NOT NULL;