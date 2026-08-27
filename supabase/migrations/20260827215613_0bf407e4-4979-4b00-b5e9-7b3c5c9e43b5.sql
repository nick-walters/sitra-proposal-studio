-- 1) New table
CREATE TABLE public.case_draft_subsections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.case_drafts(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  subsection_key text NOT NULL,
  content_html text NOT NULL DEFAULT '',
  heading text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT case_draft_subsections_case_key_uniq UNIQUE (case_id, subsection_key)
);

CREATE INDEX case_draft_subsections_proposal_idx ON public.case_draft_subsections(proposal_id);

GRANT SELECT, INSERT, UPDATE ON public.case_draft_subsections TO authenticated;
GRANT ALL ON public.case_draft_subsections TO service_role;

ALTER TABLE public.case_draft_subsections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View case draft subsections with proposal access"
  ON public.case_draft_subsections FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Insert case draft subsections as editor+"
  ON public.case_draft_subsections FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Update case draft subsections as editor+"
  ON public.case_draft_subsections FOR UPDATE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE TRIGGER update_case_draft_subsections_updated_at
  BEFORE UPDATE ON public.case_draft_subsections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Snapshot capture scope (wrap the existing definitions, adding the new table)
ALTER FUNCTION public.capture_scope_predicates() RENAME TO capture_scope_predicates_base;

CREATE OR REPLACE FUNCTION public.capture_scope_predicates()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT public.capture_scope_predicates_base()
         || jsonb_build_object('case_draft_subsections', 'proposal_id = $1');
$fn$;

-- 3) Restore scope
ALTER FUNCTION public.restore_in_scope_tables() RENAME TO restore_in_scope_tables_base;

CREATE OR REPLACE FUNCTION public.restore_in_scope_tables()
RETURNS text[]
LANGUAGE sql
STABLE
SET search_path = public
AS $fn$
  SELECT public.restore_in_scope_tables_base() || ARRAY['case_draft_subsections'];
$fn$;

-- 4) Repointed per-subsection save
CREATE OR REPLACE FUNCTION public.save_case_draft_subsection(
  p_id uuid, p_key text, p_body text, p_heading text DEFAULT NULL, p_expected_body text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_pid uuid;
  v_content jsonb;
  v_entry jsonb;
  v_current_body text;
  v_heading text;
  v_existing record;
  v_new_version integer;
  v_order integer;
BEGIN
  v_pid := public.versioned_row_proposal('case_drafts', p_id);
  IF v_pid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'conflict', false, 'error', 'not_found');
  END IF;
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), v_pid) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO v_existing FROM case_draft_subsections
   WHERE case_id = p_id AND subsection_key = p_key FOR UPDATE;

  IF FOUND THEN
    v_current_body := COALESCE(v_existing.content_html, '');
  ELSE
    -- Fall back to the legacy jsonb map for the baseline of a not-yet-migrated key.
    SELECT COALESCE(subsection_content, '{}'::jsonb) INTO v_content FROM case_drafts WHERE id = p_id;
    v_entry := v_content -> p_key;
    v_current_body := CASE
      WHEN v_entry IS NULL THEN ''
      WHEN jsonb_typeof(v_entry) = 'string' THEN v_entry #>> '{}'
      ELSE COALESCE(v_entry ->> 'body', '')
    END;
  END IF;

  IF p_expected_body IS NOT NULL AND COALESCE(v_current_body, '') <> p_expected_body THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'value', v_current_body);
  END IF;

  v_heading := COALESCE(NULLIF(p_heading, ''), NULLIF(v_existing.heading, ''), '');

  SELECT COALESCE(order_index, 0) INTO v_order FROM case_subsection_templates
   WHERE proposal_id = v_pid AND key = p_key;

  INSERT INTO case_draft_subsections (case_id, proposal_id, subsection_key, content_html, heading, order_index)
  VALUES (p_id, v_pid, p_key, COALESCE(p_body, ''), v_heading, COALESCE(v_order, 0))
  ON CONFLICT (case_id, subsection_key) DO UPDATE
    SET content_html = EXCLUDED.content_html,
        heading = EXCLUDED.heading,
        version = case_draft_subsections.version + 1
  RETURNING version INTO v_new_version;

  -- Keep the legacy jsonb map in step for one release (read-only fallback).
  UPDATE case_drafts
     SET subsection_content = COALESCE(subsection_content, '{}'::jsonb)
         || jsonb_build_object(p_key, jsonb_build_object('heading', v_heading, 'body', COALESCE(p_body, '')))
   WHERE id = p_id
  RETURNING subsection_content INTO v_content;

  RETURN jsonb_build_object('ok', true, 'conflict', false, 'version', v_new_version,
                            'subsection_content', v_content);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.save_case_draft_subsection(uuid, text, text, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_case_draft_subsection(uuid, text, text, text, text) TO authenticated;