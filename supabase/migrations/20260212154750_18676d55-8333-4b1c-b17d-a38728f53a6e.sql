
-- Add priority_level (0=none, 1=medium/amber, 2=high/red) replacing is_high_priority
ALTER TABLE public.proposal_messages ADD COLUMN IF NOT EXISTS priority_level smallint NOT NULL DEFAULT 0;

-- Migrate existing data
UPDATE public.proposal_messages SET priority_level = 2 WHERE is_high_priority = true;

-- Add resolved flag for parent messages
ALTER TABLE public.proposal_messages ADD COLUMN IF NOT EXISTS is_resolved boolean NOT NULL DEFAULT false;
