INSERT INTO public.impact_canvas_elements
  (proposal_id, kind, x, y, w, h, z, content, style)
SELECT
  'af325ea2-ae8c-4f59-8625-283d5437efba'::uuid,
  'shape',
  0, 0, 18, 1, -1000,
  '{"shape":"roundedRect","html":""}'::jsonb,
  '{"fillColor":"#000000","outlineColor":"none"}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.impact_canvas_elements
  WHERE proposal_id = 'af325ea2-ae8c-4f59-8625-283d5437efba'::uuid
    AND kind = 'shape'
    AND content->>'shape' = 'roundedRect'
    AND ROUND(x::numeric, 2) = 0
    AND ROUND(y::numeric, 2) = 0
    AND ROUND(w::numeric, 2) = 18
    AND ROUND(h::numeric, 2) = 1
);