UPDATE public.impact_canvas_elements
SET
  kind = 'shape',
  content = jsonb_set(COALESCE(content, '{}'::jsonb), '{shape}', '"rect"'::jsonb, true),
  style = COALESCE(style, '{}'::jsonb) || '{"fillColor":"none","outlineColor":"none"}'::jsonb
WHERE kind = 'text';