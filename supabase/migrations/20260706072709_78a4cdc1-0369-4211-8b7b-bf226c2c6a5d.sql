-- Impact Canvas: migrate legacy 1000×600 unit coordinates to centimetres.
-- Uniform factor: 0.018 cm/unit (18cm width / 1000 units). Preserves aspect.
-- Idempotent: only proposals whose max coord > 30 are converted (impossible
-- in the cm model where the canvas max is 25.5 cm).
UPDATE public.impact_canvas_elements
SET x = ROUND((x * 0.018)::numeric, 4)::double precision,
    y = ROUND((y * 0.018)::numeric, 4)::double precision,
    w = ROUND((w * 0.018)::numeric, 4)::double precision,
    h = ROUND((h * 0.018)::numeric, 4)::double precision
WHERE proposal_id IN (
  SELECT proposal_id
  FROM public.impact_canvas_elements
  GROUP BY proposal_id
  HAVING MAX(GREATEST(x + w, y + h)) > 30
);