UPDATE public.impact_canvas_columns ic
SET heading = 'Key outcomes & impacts'
WHERE ic.key = 'impacts'
  AND ic.heading = 'Impacts'
  AND EXISTS (
    SELECT 1
    FROM public.figures f
    WHERE f.id = ic.figure_id
      AND f.figure_type = 'overview-canvas'
  );