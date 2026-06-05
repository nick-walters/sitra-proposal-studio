ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS banner_topic_line_override text,
  ADD COLUMN IF NOT EXISTS banner_title_override text;