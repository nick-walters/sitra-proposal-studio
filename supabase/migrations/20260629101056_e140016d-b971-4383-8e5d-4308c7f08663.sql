
-- Stage 2: case multi-type data model.

-- 1) proposal_case_types table
CREATE TABLE IF NOT EXISTS public.proposal_case_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  type_code text NOT NULL,
  custom_type_name text,
  outline_color text NOT NULL DEFAULT '#000000',
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_case_types TO authenticated;
GRANT ALL ON public.proposal_case_types TO service_role;

ALTER TABLE public.proposal_case_types ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='proposal_case_types' AND policyname='Members can view case types') THEN
    CREATE POLICY "Members can view case types" ON public.proposal_case_types
      FOR SELECT USING (public.has_any_proposal_role(auth.uid(), proposal_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='proposal_case_types' AND policyname='Editors can insert case types') THEN
    CREATE POLICY "Editors can insert case types" ON public.proposal_case_types
      FOR INSERT WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='proposal_case_types' AND policyname='Editors can update case types') THEN
    CREATE POLICY "Editors can update case types" ON public.proposal_case_types
      FOR UPDATE USING (public.can_edit_proposal(auth.uid(), proposal_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='proposal_case_types' AND policyname='Editors can delete case types') THEN
    CREATE POLICY "Editors can delete case types" ON public.proposal_case_types
      FOR DELETE USING (public.can_edit_proposal(auth.uid(), proposal_id));
  END IF;
END $$;

-- partial unique: each non-'other' type_code at most once per proposal
CREATE UNIQUE INDEX IF NOT EXISTS proposal_case_types_unique_non_other
  ON public.proposal_case_types (proposal_id, type_code)
  WHERE type_code <> 'other';

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_proposal_case_types_updated_at ON public.proposal_case_types;
CREATE TRIGGER trg_proposal_case_types_updated_at
  BEFORE UPDATE ON public.proposal_case_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) case_drafts.case_type_id (nullable; ON DELETE RESTRICT)
ALTER TABLE public.case_drafts
  ADD COLUMN IF NOT EXISTS case_type_id uuid REFERENCES public.proposal_case_types(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS case_drafts_case_type_id_idx ON public.case_drafts(case_type_id);

-- 3+4) Data migration — for every proposal with cases, create one type row per
--      distinct existing (case_type, custom_type_name) pair, then point each
--      case_drafts row at its matching type row.
DO $mig$
DECLARE
  r record;
  v_type_id uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT cd.proposal_id, cd.case_type, cd.custom_type_name
    FROM public.case_drafts cd
    ORDER BY cd.proposal_id, cd.case_type, cd.custom_type_name NULLS FIRST
  LOOP
    -- find existing matching type row
    SELECT id INTO v_type_id
    FROM public.proposal_case_types
    WHERE proposal_id = r.proposal_id
      AND type_code = r.case_type
      AND COALESCE(custom_type_name, '') = COALESCE(r.custom_type_name, '')
    LIMIT 1;

    IF v_type_id IS NULL THEN
      INSERT INTO public.proposal_case_types
        (proposal_id, type_code, custom_type_name, outline_color, order_index)
      VALUES
        (r.proposal_id, r.case_type, r.custom_type_name, '#000000',
         COALESCE((SELECT MAX(order_index) + 1 FROM public.proposal_case_types
                   WHERE proposal_id = r.proposal_id), 0))
      RETURNING id INTO v_type_id;
    END IF;

    UPDATE public.case_drafts
    SET case_type_id = v_type_id
    WHERE proposal_id = r.proposal_id
      AND case_type = r.case_type
      AND COALESCE(custom_type_name, '') = COALESCE(r.custom_type_name, '')
      AND case_type_id IS DISTINCT FROM v_type_id;
  END LOOP;
END
$mig$;

-- 5) Renumber existing cases 1..n within each case_type_id (preserving current order).
DO $renum$
DECLARE
  v_max int;
BEGIN
  -- Two-phase to avoid unique collisions on the soon-to-be-replaced
  -- (proposal_id, number) constraint.
  SELECT COALESCE(MAX(number), 0) INTO v_max FROM public.case_drafts;

  -- Phase 1: push every row into a safe high-numbered band keyed by its rank.
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY case_type_id ORDER BY number, created_at, id) AS rn
    FROM public.case_drafts
    WHERE case_type_id IS NOT NULL
  )
  UPDATE public.case_drafts cd
  SET number = v_max + 1000 + ranked.rn
  FROM ranked
  WHERE cd.id = ranked.id;

  -- Phase 2: re-rank into 1..n per type.
  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY case_type_id ORDER BY number, created_at, id) AS rn
    FROM public.case_drafts
    WHERE case_type_id IS NOT NULL
  )
  UPDATE public.case_drafts cd
  SET number = ranked.rn
  FROM ranked
  WHERE cd.id = ranked.id;
END
$renum$;

-- 6) Swap the uniqueness constraint: (proposal_id, number) -> (case_type_id, number)
ALTER TABLE public.case_drafts DROP CONSTRAINT IF EXISTS case_drafts_proposal_id_number_key;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'case_drafts_case_type_id_number_key'
      AND conrelid = 'public.case_drafts'::regclass
  ) THEN
    ALTER TABLE public.case_drafts
      ADD CONSTRAINT case_drafts_case_type_id_number_key UNIQUE (case_type_id, number);
  END IF;
END $$;
