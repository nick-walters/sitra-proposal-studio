
ALTER TABLE public.proposal_milestone_wps
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- Backfill: for each milestone, mark the link with the lowest WP number as primary.
WITH ranked AS (
  SELECT mw.ctid,
         row_number() OVER (
           PARTITION BY mw.milestone_id
           ORDER BY wd.number ASC, mw.ctid
         ) AS rn
  FROM public.proposal_milestone_wps mw
  JOIN public.wp_drafts wd ON wd.id = mw.wp_draft_id
)
UPDATE public.proposal_milestone_wps mw
SET is_primary = true
FROM ranked r
WHERE mw.ctid = r.ctid AND r.rn = 1;

-- Partial unique index: at most one primary per milestone.
CREATE UNIQUE INDEX IF NOT EXISTS proposal_milestone_wps_primary_unique
  ON public.proposal_milestone_wps (milestone_id)
  WHERE is_primary;

DROP TABLE IF EXISTS public.proposal_milestone_tasks;
