ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS banner_topic_text text,
  ADD COLUMN IF NOT EXISTS header_topic_text text;

COMMENT ON COLUMN public.proposals.banner_topic_text IS 'Editable "Topic ID, title & type banner" line for the page-one black banner. NULL or empty means the value is derived live from topic_id / topic_title / type.';
COMMENT ON COLUMN public.proposals.header_topic_text IS 'Editable "Topic ID, title & type header" line for the running header on pages 2+. NULL or empty means the value is derived live from topic_id / topic_title / type.';