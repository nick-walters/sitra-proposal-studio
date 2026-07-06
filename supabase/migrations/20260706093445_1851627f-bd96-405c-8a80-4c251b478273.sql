-- Extend allowed kinds to include 'header'
ALTER TABLE public.impact_canvas_elements
  DROP CONSTRAINT IF EXISTS impact_canvas_elements_kind_check;
ALTER TABLE public.impact_canvas_elements
  ADD CONSTRAINT impact_canvas_elements_kind_check
  CHECK (kind = ANY (ARRAY['bound'::text,'shape'::text,'arrow'::text,'icon'::text,'image'::text,'text'::text,'line'::text,'header'::text]));

-- SUSIE-Q retroactive normalisation (scoped by proposal_id)
DO $mig$
DECLARE
  pid uuid := 'af325ea2-ae8c-4f59-8625-283d5437efba';
  col RECORD;
  r RECORD;
  ri int;
BEGIN
  FOR col IN
    SELECT key, order_index FROM public.impact_canvas_columns
    WHERE proposal_id = pid ORDER BY order_index
  LOOP
    -- Normalise cell bound boxes to defaults (2 cm wide, 0.8 cm high,
    -- horizontal step 3.2 cm from x=0, vertical step 1.1 cm below the
    -- 1.08 cm header band).
    ri := 0;
    FOR r IN
      SELECT id FROM public.impact_canvas_rows
      WHERE proposal_id = pid ORDER BY order_index
    LOOP
      UPDATE public.impact_canvas_elements
      SET x = col.order_index * 3.2,
          y = 1.08 + ri * 1.1,
          w = 2,
          h = 0.8,
          style = COALESCE(style, '{}'::jsonb) || jsonb_build_object('autoFitH', true)
      WHERE proposal_id = pid
        AND kind = 'bound'
        AND bound_row_id = r.id
        AND bound_col_key = col.key;
      ri := ri + 1;
    END LOOP;

    -- Ensure exactly one header element per column at defaults (2 × 1 cm,
    -- 1.2 cm apart, top row).
    INSERT INTO public.impact_canvas_elements
      (proposal_id, kind, bound_col_key, bound_row_id, x, y, w, h, z, content, style)
    SELECT pid, 'header', col.key, NULL, col.order_index * 3.2, 0, 2, 1, 0, '{}'::jsonb, '{}'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM public.impact_canvas_elements
      WHERE proposal_id = pid AND kind = 'header' AND bound_col_key = col.key
    );

    UPDATE public.impact_canvas_elements
    SET x = col.order_index * 3.2, y = 0, w = 2, h = 1
    WHERE proposal_id = pid AND kind = 'header' AND bound_col_key = col.key;
  END LOOP;
END
$mig$;