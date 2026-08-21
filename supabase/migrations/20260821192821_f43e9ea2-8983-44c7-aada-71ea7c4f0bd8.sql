-- Figure numbers and section placement are now derived from the block that
-- shows the figure. These columns are vestigial: kept for now, never read.
-- Defaults let writers stop supplying them.
ALTER TABLE public.figures ALTER COLUMN figure_number SET DEFAULT '';
ALTER TABLE public.figures ALTER COLUMN section_id SET DEFAULT '';