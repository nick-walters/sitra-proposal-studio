ALTER TABLE public.wp_dependencies ADD COLUMN direction text NOT NULL DEFAULT 'forward';
-- direction values: 'forward' (left→right), 'reverse' (right→left), 'bidirectional'