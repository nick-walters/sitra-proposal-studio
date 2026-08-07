with ext as (
  select f.id,
         coalesce(max(e.y + e.h), 0) + 0.3 as needed
  from public.figures f
  left join public.impact_canvas_elements e
    on (f.figure_type = 'overview-canvas' and e.figure_id = f.id)
    or (f.figure_type = 'impact-canvas' and e.figure_id is null and e.proposal_id = f.proposal_id)
  where f.figure_type in ('impact-canvas','overview-canvas')
  group by f.id
)
update public.figures f
set content = coalesce(f.content, '{}'::jsonb)
      || jsonb_build_object('heightCm', round(ext.needed::numeric, 1), 'presetId', 'custom')
from ext
where f.id = ext.id
  and ext.needed > coalesce((f.content->>'heightCm')::numeric, 0);