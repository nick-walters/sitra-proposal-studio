ALTER TABLE public.participant_members
  ADD COLUMN IF NOT EXISTS order_index integer NOT NULL DEFAULT 0;

WITH ordered AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY participant_id
           ORDER BY is_primary_contact DESC NULLS LAST, created_at, id
         ) - 1 AS idx
  FROM public.participant_members
)
UPDATE public.participant_members m
   SET order_index = ordered.idx
  FROM ordered
 WHERE ordered.id = m.id;

ALTER TABLE public.participant_researchers
  ADD COLUMN IF NOT EXISTS member_id uuid NULL REFERENCES public.participant_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS participant_researchers_member_id_unique
  ON public.participant_researchers (member_id)
  WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS participant_members_order_idx
  ON public.participant_members (participant_id, order_index);