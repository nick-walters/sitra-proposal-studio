UPDATE public.impact_canvas_elements
SET style = COALESCE(style, '{}'::jsonb) || jsonb_build_object('fillColor', '#9CA3AF')
WHERE proposal_id = 'af325ea2-ae8c-4f59-8625-283d5437efba'
  AND (
    kind = 'shape'
    OR (kind = 'bound' AND bound_row_id IS NOT NULL)
  );