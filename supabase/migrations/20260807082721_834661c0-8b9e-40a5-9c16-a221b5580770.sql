UPDATE public.figures
SET content = coalesce(content, '{}'::jsonb) || jsonb_build_object('presetId','full','widthCm',18,'heightCm',25.5)
WHERE figure_type = 'impact-canvas'
  AND (content->>'heightCm') IS NULL;

UPDATE public.figures
SET content = coalesce(content, '{}'::jsonb) || jsonb_build_object('presetId','third','widthCm',18,'heightCm',8.5)
WHERE figure_type = 'overview-canvas'
  AND (content->>'heightCm') IS NULL;