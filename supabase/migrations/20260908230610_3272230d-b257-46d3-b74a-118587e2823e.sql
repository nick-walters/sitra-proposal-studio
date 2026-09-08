ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS evaluation_instructions text;

COMMENT ON COLUMN public.proposals.evaluation_instructions IS
  'Free-text instructions from the proposal team to the mock AI evaluation panel. Persisted per proposal; snapshotted onto each run.';