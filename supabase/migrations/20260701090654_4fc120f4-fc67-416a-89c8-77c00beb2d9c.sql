
-- 1. Create part_a1 table
CREATE TABLE public.part_a1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  abstract text NOT NULL DEFAULT '',
  fixed_keywords text[] NOT NULL DEFAULT '{}',
  free_keywords text NOT NULL DEFAULT '',
  previous_submission text NOT NULL DEFAULT '',
  previous_submission_reference text NOT NULL DEFAULT '',
  declarations jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proposal_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.part_a1 TO authenticated;
GRANT ALL ON public.part_a1 TO service_role;

ALTER TABLE public.part_a1 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "part_a1 view via proposal role"
  ON public.part_a1 FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "part_a1 insert via edit role"
  ON public.part_a1 FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "part_a1 update via edit role"
  ON public.part_a1 FOR UPDATE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "part_a1 delete via edit role"
  ON public.part_a1 FOR DELETE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE TRIGGER part_a1_updated_at
  BEFORE UPDATE ON public.part_a1
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Non-destructive backfill from section_content (section_id='a1')
-- Recursively unwraps abstract-in-abstract JSON corruption. Idempotent.
DO $$
DECLARE
  r record;
  parsed jsonb;
  inner_txt text;
  inner_json jsonb;
  safety int;
BEGIN
  FOR r IN SELECT proposal_id, content FROM public.section_content WHERE section_id = 'a1'
  LOOP
    IF EXISTS (SELECT 1 FROM public.part_a1 WHERE proposal_id = r.proposal_id) THEN
      CONTINUE;
    END IF;

    BEGIN
      parsed := r.content::jsonb;
    EXCEPTION WHEN others THEN
      -- Legacy plain-text A1: treat whole content as abstract
      INSERT INTO public.part_a1 (proposal_id, abstract)
      VALUES (r.proposal_id, COALESCE(r.content, ''));
      CONTINUE;
    END;

    -- If root isn't an object with expected keys, treat as plain abstract
    IF jsonb_typeof(parsed) <> 'object' OR NOT (parsed ? 'abstract') THEN
      INSERT INTO public.part_a1 (proposal_id, abstract)
      VALUES (r.proposal_id, COALESCE(r.content, ''));
      CONTINUE;
    END IF;

    -- Recursive unwrap of nested abstract-in-abstract corruption
    safety := 0;
    LOOP
      safety := safety + 1;
      EXIT WHEN safety > 10;
      IF jsonb_typeof(parsed->'abstract') <> 'string' THEN EXIT; END IF;
      inner_txt := parsed->>'abstract';
      BEGIN
        inner_json := inner_txt::jsonb;
      EXCEPTION WHEN others THEN
        EXIT;
      END;
      IF jsonb_typeof(inner_json) = 'object' AND (inner_json ? 'abstract') THEN
        parsed := inner_json;
      ELSE
        EXIT;
      END IF;
    END LOOP;

    INSERT INTO public.part_a1 (
      proposal_id, abstract, fixed_keywords, free_keywords,
      previous_submission, previous_submission_reference, declarations
    ) VALUES (
      r.proposal_id,
      COALESCE(parsed->>'abstract', ''),
      CASE WHEN jsonb_typeof(parsed->'fixedKeywords') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(parsed->'fixedKeywords'))
        ELSE '{}'::text[] END,
      COALESCE(parsed->>'freeKeywords', ''),
      COALESCE(parsed->>'previousSubmission', ''),
      COALESCE(parsed->>'previousSubmissionReference', ''),
      COALESCE(parsed->'declarations', '{}'::jsonb)
    );
  END LOOP;
END $$;
