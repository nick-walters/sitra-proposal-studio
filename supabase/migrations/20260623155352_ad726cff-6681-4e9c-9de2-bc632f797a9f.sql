
ALTER TABLE public.wp_drafts
  ADD COLUMN IF NOT EXISTS b31_populated_objectives boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS b31_populated_description boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS b31_populated_tasks boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS b31_populated_deliverables boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS b31_populated_milestones boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS b31_populated_risks boolean NOT NULL DEFAULT false;

-- Drop the auto-seed trigger on wp_drafts so new WPs start empty in B3.1
DO $$
DECLARE
  trg_name text;
BEGIN
  FOR trg_name IN
    SELECT tgname FROM pg_trigger
    WHERE tgrelid = 'public.wp_drafts'::regclass
      AND NOT tgisinternal
      AND tgfoid = 'public.initialize_b31_tasks'::regproc
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.wp_drafts', trg_name);
  END LOOP;
END $$;
