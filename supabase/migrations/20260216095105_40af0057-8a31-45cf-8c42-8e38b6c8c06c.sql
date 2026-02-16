ALTER TABLE public.wp_drafts
  ADD COLUMN manual_person_months numeric NULL,
  ADD COLUMN manual_duration text NULL;