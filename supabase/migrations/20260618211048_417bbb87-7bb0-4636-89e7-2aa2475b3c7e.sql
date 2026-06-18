
-- STEP 1: Wipe and reshape
DELETE FROM public.organisations;

ALTER TABLE public.organisations DROP CONSTRAINT IF EXISTS organisations_name_key;

-- Ensure UNIQUE on pic_number (already exists per investigation, but idempotent)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organisations_pic_number_key' AND conrelid = 'public.organisations'::regclass
  ) THEN
    ALTER TABLE public.organisations ADD CONSTRAINT organisations_pic_number_key UNIQUE (pic_number);
  END IF;
END $$;

ALTER TABLE public.organisations DROP COLUMN IF EXISTS legal_entity_type;
ALTER TABLE public.organisations DROP COLUMN IF EXISTS is_sme;

ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS organisation_category TEXT;
ALTER TABLE public.organisations DROP CONSTRAINT IF EXISTS organisations_category_check;
ALTER TABLE public.organisations ADD CONSTRAINT organisations_category_check
  CHECK (organisation_category IS NULL OR organisation_category IN ('HES','RES','SME','LE','PUB','INT','OTH'));

ALTER TABLE public.organisations ALTER COLUMN short_name SET NOT NULL;
ALTER TABLE public.organisations ALTER COLUMN pic_number SET NOT NULL;
ALTER TABLE public.organisations ALTER COLUMN name SET NOT NULL;

-- STEP 2: Seed six registry entries from definitive ADDGenAI
INSERT INTO public.organisations (pic_number, name, short_name, english_name, country, organisation_category, logo_url, created_by)
SELECT pic_number, organisation_name, organisation_short_name, english_name, country, organisation_category, NULL, NULL
FROM public.participants
WHERE proposal_id = 'dd66432e-dccb-4303-9db3-dcba9e16bfc9'
ORDER BY participant_number;

-- STEP 4: RLS policies
DROP POLICY IF EXISTS "Authenticated users can view organisations" ON public.organisations;
DROP POLICY IF EXISTS "Coordinators can add organisations" ON public.organisations;
DROP POLICY IF EXISTS "Coordinators can update organisations" ON public.organisations;
DROP POLICY IF EXISTS "Coordinators can delete organisations" ON public.organisations;
-- Drop any pre-existing legacy policies
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='organisations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.organisations', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view organisations" ON public.organisations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Coordinators can add organisations" ON public.organisations
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('coordinator','admin','owner'))
  );

CREATE POLICY "Coordinators can update organisations" ON public.organisations
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('coordinator','admin','owner'))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('coordinator','admin','owner'))
  );

CREATE POLICY "Coordinators can delete organisations" ON public.organisations
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('coordinator','admin','owner'))
  );

-- STEP 5: updated_at trigger
DROP TRIGGER IF EXISTS update_organisations_updated_at ON public.organisations;
CREATE TRIGGER update_organisations_updated_at
  BEFORE UPDATE ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
