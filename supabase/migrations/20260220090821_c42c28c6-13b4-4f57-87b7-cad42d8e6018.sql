ALTER TABLE public.proposals ADD COLUMN topic_footnotes jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.proposals ADD COLUMN destination_footnotes jsonb DEFAULT '[]'::jsonb;