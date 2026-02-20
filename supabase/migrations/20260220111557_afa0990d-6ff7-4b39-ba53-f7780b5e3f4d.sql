
-- Add per-field footnote columns (outcome and scope), migrate old data
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS outcome_footnotes jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS scope_footnotes jsonb DEFAULT '[]'::jsonb;

-- Migrate old topic_footnotes to outcome_footnotes (best guess - user can re-assign)
UPDATE public.proposals 
SET outcome_footnotes = COALESCE(topic_footnotes, '[]'::jsonb)
WHERE topic_footnotes IS NOT NULL AND topic_footnotes != '[]'::jsonb;
