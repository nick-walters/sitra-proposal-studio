UPDATE public.impact_canvas_elements
SET style = COALESCE(style, '{}'::jsonb) || jsonb_build_object('outlineColor', 'none')
WHERE proposal_id = 'af325ea2-ae8c-4f59-8625-283d5437efba'
  AND kind IN ('bound','header');