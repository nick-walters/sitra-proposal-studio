-- Add acronym_segments column to store character-level color formatting
-- Format: [{"text": "Green", "color": "#22c55e"}, {"text": "Tech", "color": "#14b8a6"}]
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS acronym_segments jsonb DEFAULT NULL;