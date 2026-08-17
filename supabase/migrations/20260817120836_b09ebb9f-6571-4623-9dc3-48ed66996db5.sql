-- 1. Per-text-box version history -------------------------------------------
ALTER TABLE public.card_field_versions
  ADD COLUMN IF NOT EXISTS text_box text NOT NULL DEFAULT 'content';

ALTER TABLE public.card_field_versions
  DROP CONSTRAINT IF EXISTS card_field_versions_unique;

ALTER TABLE public.card_field_versions DISABLE TRIGGER trg_card_field_versions_no_update;
ALTER TABLE public.card_field_versions DISABLE TRIGGER trg_card_field_versions_no_delete;

-- Split every existing row into a header row (when it carried a heading).
INSERT INTO public.card_field_versions (
  field_id, proposal_id, version_number, content_html, heading, is_auto_save,
  created_by, created_at, text_box
)
SELECT field_id, proposal_id, version_number, NULL, heading, is_auto_save,
       created_by, created_at, 'header'
  FROM public.card_field_versions
 WHERE text_box = 'content'
   AND NULLIF(btrim(COALESCE(heading, '')), '') IS NOT NULL;

-- A row with no content is not a content version.
DELETE FROM public.card_field_versions
 WHERE text_box = 'content' AND content_html IS NULL;

UPDATE public.card_field_versions SET heading = NULL WHERE text_box = 'content';

-- Independent numbering per (field_id, text_box).
WITH renum AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY field_id, text_box ORDER BY created_at, version_number, id
         ) AS n
    FROM public.card_field_versions
)
UPDATE public.card_field_versions v
   SET version_number = renum.n
  FROM renum
 WHERE renum.id = v.id AND v.version_number IS DISTINCT FROM renum.n;

ALTER TABLE public.card_field_versions ENABLE TRIGGER trg_card_field_versions_no_update;
ALTER TABLE public.card_field_versions ENABLE TRIGGER trg_card_field_versions_no_delete;

ALTER TABLE public.card_field_versions
  ADD CONSTRAINT card_field_versions_text_box_check CHECK (text_box IN ('header', 'content'));

ALTER TABLE public.card_field_versions
  ADD CONSTRAINT card_field_versions_unique UNIQUE (field_id, text_box, version_number);

DROP INDEX IF EXISTS public.idx_card_field_versions_field;
CREATE INDEX idx_card_field_versions_field
  ON public.card_field_versions (field_id, text_box, version_number DESC);

-- 2. save_card_field_version: one text box at a time --------------------------
DROP FUNCTION IF EXISTS public.save_card_field_version(uuid, text, text, boolean);

CREATE OR REPLACE FUNCTION public.save_card_field_version(
  p_field_id uuid,
  p_text_box text,
  p_value text,
  p_is_auto_save boolean DEFAULT true
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_proposal_id uuid;
  v_next integer;
  v_last record;
BEGIN
  IF p_text_box NOT IN ('header', 'content') THEN
    RAISE EXCEPTION 'Unknown text box: %', p_text_box;
  END IF;

  SELECT proposal_id INTO v_proposal_id FROM public.card_fields WHERE id = p_field_id;
  IF v_proposal_id IS NULL THEN RAISE EXCEPTION 'Field not found'; END IF;
  IF NOT public.can_edit_proposal(auth.uid(), v_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
  END IF;

  SELECT content_html, heading, version_number INTO v_last
    FROM public.card_field_versions
   WHERE field_id = p_field_id AND text_box = p_text_box
   ORDER BY version_number DESC LIMIT 1;

  IF FOUND AND COALESCE(
       CASE WHEN p_text_box = 'header' THEN v_last.heading ELSE v_last.content_html END, ''
     ) IS NOT DISTINCT FROM COALESCE(p_value, '') THEN
    RETURN v_last.version_number;
  END IF;

  SELECT COALESCE(max(version_number), 0) + 1 INTO v_next
    FROM public.card_field_versions WHERE field_id = p_field_id AND text_box = p_text_box;

  INSERT INTO public.card_field_versions (
    field_id, proposal_id, version_number, text_box, content_html, heading, is_auto_save, created_by
  ) VALUES (
    p_field_id, v_proposal_id, v_next, p_text_box,
    CASE WHEN p_text_box = 'content' THEN p_value END,
    CASE WHEN p_text_box = 'header' THEN p_value END,
    p_is_auto_save, auth.uid()
  );
  RETURN v_next;
END;
$fn$;

-- 3. Module header toggle -----------------------------------------------------
ALTER TABLE public.card_fields
  ADD COLUMN IF NOT EXISTS heading_enabled boolean NOT NULL DEFAULT true;

UPDATE public.card_fields
   SET heading_enabled = (NULLIF(btrim(COALESCE(heading, '')), '') IS NOT NULL);

-- 4. Never let a NULL legacy title clobber a seeded block title ---------------
DO $mig$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO d
    FROM pg_proc WHERE proname = 'migrate_b12_to_cards' AND pronamespace = 'public'::regnamespace;
  d := replace(
    d,
    'SET title = s.title, is_visible = s.is_visible',
    'SET title = COALESCE(NULLIF(btrim(s.title), ''''), title), is_visible = s.is_visible'
  );
  EXECUTE d;
END $mig$;