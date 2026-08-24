
-- ============================================================
-- 1. TEMPLATE VERSIONS (copy-on-write header)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type_id uuid NOT NULL REFERENCES public.template_types(id) ON DELETE CASCADE,
  major integer,
  minor integer,
  name text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  notes text,
  published_at timestamptz,
  published_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.template_versions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.template_versions TO authenticated;
GRANT ALL ON public.template_versions TO service_role;
ALTER TABLE public.template_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone authenticated can read template versions" ON public.template_versions;
CREATE POLICY "Anyone authenticated can read template versions"
  ON public.template_versions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Owners manage template versions" ON public.template_versions;
CREATE POLICY "Owners manage template versions"
  ON public.template_versions FOR ALL TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

CREATE UNIQUE INDEX IF NOT EXISTS template_versions_number_uniq
  ON public.template_versions (template_type_id, major, minor)
  WHERE status = 'published';
CREATE UNIQUE INDEX IF NOT EXISTS template_versions_one_draft
  ON public.template_versions (template_type_id)
  WHERE status = 'draft';

DROP TRIGGER IF EXISTS trg_template_versions_updated_at ON public.template_versions;
CREATE TRIGGER trg_template_versions_updated_at BEFORE UPDATE ON public.template_versions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Version columns
ALTER TABLE public.card_templates            ADD COLUMN IF NOT EXISTS template_version_id uuid REFERENCES public.template_versions(id) ON DELETE CASCADE;
ALTER TABLE public.card_guidelines           ADD COLUMN IF NOT EXISTS template_version_id uuid REFERENCES public.template_versions(id) ON DELETE CASCADE;
ALTER TABLE public.card_guideline_templates  ADD COLUMN IF NOT EXISTS template_version_id uuid REFERENCES public.template_versions(id) ON DELETE CASCADE;
ALTER TABLE public.card_guideline_sections   ADD COLUMN IF NOT EXISTS template_version_id uuid REFERENCES public.template_versions(id) ON DELETE CASCADE;
ALTER TABLE public.card_guideline_documents  ADD COLUMN IF NOT EXISTS template_version_id uuid REFERENCES public.template_versions(id) ON DELETE CASCADE;
ALTER TABLE public.proposals                 ADD COLUMN IF NOT EXISTS template_version_id uuid REFERENCES public.template_versions(id) ON DELETE SET NULL;

-- ============================================================
-- 2. CUT VERSION 1.0 PER TEMPLATE TYPE AND BACKFILL
-- ============================================================
INSERT INTO public.template_versions (template_type_id, major, minor, name, status, published_at, notes)
SELECT tt.id, 1, 0, 'Initial cut', 'published', now(),
       'Cut from the live template content at the introduction of versioning.'
  FROM public.template_types tt
 WHERE NOT EXISTS (SELECT 1 FROM public.template_versions v WHERE v.template_type_id = tt.id);

UPDATE public.card_templates ct
   SET template_version_id = v.id
  FROM public.template_versions v
 WHERE v.template_type_id = ct.template_type_id AND v.major = 1 AND v.minor = 0
   AND ct.template_version_id IS NULL;

-- Guidelines inherit the version of whatever they are attached to; anything
-- unattached lands on the version of the only type that has card content.
UPDATE public.card_guidelines g
   SET template_version_id = ct.template_version_id
  FROM public.card_guideline_templates l
  JOIN public.card_templates ct ON ct.id = l.card_template_id
 WHERE l.guideline_id = g.id AND g.template_version_id IS NULL;

UPDATE public.card_guidelines g
   SET template_version_id = v.id
  FROM public.card_guideline_sections l
  JOIN public.template_sections ts ON ts.id = l.section_source_id
  JOIN public.template_versions v ON v.template_type_id = ts.template_type_id AND v.major = 1 AND v.minor = 0
 WHERE l.guideline_id = g.id AND g.template_version_id IS NULL;

UPDATE public.card_guidelines g
   SET template_version_id = (
     SELECT v.id FROM public.template_versions v
      JOIN public.template_types tt ON tt.id = v.template_type_id
     WHERE tt.code = 'HE_RIA_IA_FULL' AND v.major = 1 AND v.minor = 0 LIMIT 1)
 WHERE g.template_version_id IS NULL;

UPDATE public.card_guideline_templates l SET template_version_id = ct.template_version_id
  FROM public.card_templates ct WHERE ct.id = l.card_template_id AND l.template_version_id IS NULL;
UPDATE public.card_guideline_sections l SET template_version_id = g.template_version_id
  FROM public.card_guidelines g WHERE g.id = l.guideline_id AND l.template_version_id IS NULL;
UPDATE public.card_guideline_documents l SET template_version_id = g.template_version_id
  FROM public.card_guidelines g WHERE g.id = l.guideline_id AND l.template_version_id IS NULL;

-- Existing proposals are pinned to 1.0 of their own type.
UPDATE public.proposals p
   SET template_version_id = v.id
  FROM public.template_versions v
 WHERE v.template_type_id = p.template_type_id AND v.major = 1 AND v.minor = 0
   AND p.template_version_id IS NULL AND p.template_type_id IS NOT NULL;

-- Keys are unique per VERSION, not per type, now that versions coexist.
ALTER TABLE public.card_templates DROP CONSTRAINT IF EXISTS card_templates_type_key_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS card_templates_version_key_uniq
  ON public.card_templates (template_version_id, key);

-- ============================================================
-- 3. VERSION RESOLUTION, DRAFTING AND PUBLISHING
-- ============================================================
CREATE OR REPLACE FUNCTION public.latest_published_template_version(p_template_type_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.template_versions
   WHERE template_type_id = p_template_type_id AND status = 'published'
   ORDER BY major DESC, minor DESC LIMIT 1;
$$;
REVOKE EXECUTE ON FUNCTION public.latest_published_template_version(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.latest_published_template_version(uuid) TO authenticated, service_role;

/* Get-or-create the open DRAFT of a template type. The draft is a full
   copy-on-write clone of the latest published version, so editing it can
   never reach a proposal that is pinned to a published version. */
CREATE OR REPLACE FUNCTION public.ensure_template_draft(p_template_type_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_draft uuid;
  v_source uuid;
BEGIN
  IF NOT public.is_global_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: platform owners only';
  END IF;

  SELECT id INTO v_draft FROM public.template_versions
   WHERE template_type_id = p_template_type_id AND status = 'draft';
  IF v_draft IS NOT NULL THEN RETURN v_draft; END IF;

  v_source := public.latest_published_template_version(p_template_type_id);

  INSERT INTO public.template_versions (template_type_id, status, created_by)
  VALUES (p_template_type_id, 'draft', auth.uid())
  RETURNING id INTO v_draft;

  IF v_source IS NULL THEN RETURN v_draft; END IF;

  CREATE TEMP TABLE _ct_map (old uuid, new uuid) ON COMMIT DROP;
  CREATE TEMP TABLE _cg_map (old uuid, new uuid) ON COMMIT DROP;

  WITH src AS (
    SELECT *, gen_random_uuid() AS new_id FROM public.card_templates WHERE template_version_id = v_source
  ), ins AS (
    INSERT INTO public.card_templates (id, template_type_id, template_version_id, section_source_id,
      section_number, document, key, kind, default_title, anchor, order_index, is_deletable, is_hideable,
      is_source_fed, is_fixed_position, default_visible, source_key, render_group, condition_budget_type,
      condition_uses_fstp, default_fields, is_active)
    SELECT new_id, template_type_id, v_draft, section_source_id, section_number, document, key, kind,
      default_title, anchor, order_index, is_deletable, is_hideable, is_source_fed, is_fixed_position,
      default_visible, source_key, render_group, condition_budget_type, condition_uses_fstp,
      default_fields, is_active FROM src
    RETURNING id
  )
  INSERT INTO _ct_map SELECT id, new_id FROM src;

  WITH src AS (
    SELECT *, gen_random_uuid() AS new_id FROM public.card_guidelines WHERE template_version_id = v_source
  ), ins AS (
    INSERT INTO public.card_guidelines (id, template_version_id, guideline_type, title, content,
      order_index, condition_budget_type, condition_uses_fstp, is_active)
    SELECT new_id, v_draft, guideline_type, title, content, order_index, condition_budget_type,
      condition_uses_fstp, is_active FROM src
    RETURNING id
  )
  INSERT INTO _cg_map SELECT id, new_id FROM src;

  INSERT INTO public.card_guideline_templates (guideline_id, card_template_id, order_index, template_version_id)
  SELECT gm.new, cm.new, l.order_index, v_draft
    FROM public.card_guideline_templates l
    JOIN _cg_map gm ON gm.old = l.guideline_id
    JOIN _ct_map cm ON cm.old = l.card_template_id
   WHERE l.template_version_id = v_source;

  INSERT INTO public.card_guideline_sections (guideline_id, section_source_id, template_version_id)
  SELECT gm.new, l.section_source_id, v_draft
    FROM public.card_guideline_sections l JOIN _cg_map gm ON gm.old = l.guideline_id
   WHERE l.template_version_id = v_source;

  INSERT INTO public.card_guideline_documents (guideline_id, document, order_index, template_version_id)
  SELECT gm.new, l.document, l.order_index, v_draft
    FROM public.card_guideline_documents l JOIN _cg_map gm ON gm.old = l.guideline_id
   WHERE l.template_version_id = v_source;

  DROP TABLE _ct_map;
  DROP TABLE _cg_map;
  RETURN v_draft;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ensure_template_draft(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_template_draft(uuid) TO authenticated, service_role;

/* Cut the open draft as a numbered version. Minor by default; a major bump
   resets the minor counter and normally carries a name. */
CREATE OR REPLACE FUNCTION public.publish_template_version(
  p_version_id uuid, p_major boolean DEFAULT false, p_name text DEFAULT NULL, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_type uuid;
  v_major integer;
  v_minor integer;
BEGIN
  IF NOT public.is_global_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: platform owners only';
  END IF;

  SELECT template_type_id INTO v_type FROM public.template_versions
   WHERE id = p_version_id AND status = 'draft';
  IF v_type IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No open draft to publish'); END IF;

  SELECT COALESCE(max(major), 1) INTO v_major FROM public.template_versions
   WHERE template_type_id = v_type AND status = 'published';

  IF p_major THEN
    v_major := v_major + 1;
    v_minor := 0;
  ELSE
    SELECT COALESCE(max(minor), -1) + 1 INTO v_minor FROM public.template_versions
     WHERE template_type_id = v_type AND status = 'published' AND major = v_major;
  END IF;

  UPDATE public.template_versions
     SET status = 'published', major = v_major, minor = v_minor,
         name = NULLIF(btrim(COALESCE(p_name, '')), ''), notes = p_notes,
         published_at = now(), published_by = auth.uid()
   WHERE id = p_version_id;

  RETURN jsonb_build_object('ok', true, 'version_id', p_version_id, 'major', v_major, 'minor', v_minor);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.publish_template_version(uuid, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_template_version(uuid, boolean, text, text) TO authenticated, service_role;

/* Guideline resolution for a proposal: which version it is pinned to. */
CREATE OR REPLACE FUNCTION public.proposal_template_version(p_proposal_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(p.template_version_id, public.latest_published_template_version(p.template_type_id))
    FROM public.proposals p WHERE p.id = p_proposal_id;
$$;
REVOKE EXECUTE ON FUNCTION public.proposal_template_version(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.proposal_template_version(uuid) TO authenticated, service_role;

-- ============================================================
-- 4. SEEDING AND CREATION RESOLVE THE PROPOSAL'S VERSION
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_proposal_cards(p_proposal_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_prop record;
  v_version uuid;
  t record;
  v_section_id uuid;
  v_idx integer;
  v_card_id uuid;
  v_created integer := 0;
  v_field jsonb;
  v_pos integer;
BEGIN
  IF NOT public.is_global_admin(auth.uid()) THEN
    RAISE EXCEPTION 'The cards board is restricted to platform owners during beta';
  END IF;

  SELECT id, template_type_id, template_version_id, budget_type,
         COALESCE(uses_fstp, false) AS uses_fstp, status
    INTO v_prop FROM public.proposals WHERE id = p_proposal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;
  IF NOT (public.is_coordinator_or_above(auth.uid()) AND public.is_proposal_admin(auth.uid(), p_proposal_id)) THEN
    RAISE EXCEPTION 'Permission denied: coordinator or above required';
  END IF;
  IF v_prop.template_type_id IS NULL THEN RETURN 0; END IF;

  v_version := COALESCE(v_prop.template_version_id,
                        public.latest_published_template_version(v_prop.template_type_id));
  IF v_version IS NULL THEN RETURN 0; END IF;

  FOR t IN
    SELECT * FROM public.card_templates
     WHERE template_version_id = v_version
       AND is_active
       AND (condition_budget_type IS NULL OR condition_budget_type = v_prop.budget_type)
       AND (condition_uses_fstp IS NULL OR condition_uses_fstp = v_prop.uses_fstp)
     ORDER BY document, section_number, anchor, order_index
  LOOP
    SELECT pts.id INTO v_section_id
      FROM public.proposal_template_sections pts
      JOIN public.proposal_templates pt ON pt.id = pts.proposal_template_id
     WHERE pt.proposal_id = p_proposal_id
       AND (
         (t.section_source_id IS NOT NULL AND pts.source_section_id = t.section_source_id)
         OR pts.section_number = t.section_number
       )
     ORDER BY (t.section_source_id IS NOT NULL AND pts.source_section_id = t.section_source_id) DESC
     LIMIT 1;

    IF v_section_id IS NULL THEN CONTINUE; END IF;
    IF EXISTS (SELECT 1 FROM public.proposal_cards
                WHERE proposal_id = p_proposal_id AND template_key = t.key) THEN
      CONTINUE;
    END IF;

    IF t.anchor = 'head' THEN
      SELECT COALESCE(max(order_index) + 10, 0) INTO v_idx FROM public.proposal_cards
       WHERE section_id = v_section_id AND anchor = 'head';
    ELSIF t.anchor = 'tail' THEN
      SELECT COALESCE(max(order_index) + 10, 1000) INTO v_idx FROM public.proposal_cards
       WHERE section_id = v_section_id AND anchor = 'tail';
    ELSE
      SELECT COALESCE(max(order_index) + 1, 100) INTO v_idx FROM public.proposal_cards
       WHERE section_id = v_section_id AND anchor = 'free';
    END IF;

    INSERT INTO public.proposal_cards (
      proposal_id, section_id, document, kind, template_key, title, order_index, anchor,
      is_deletable, is_hideable, is_source_fed, is_fixed_position, is_visible,
      source_key, render_group, origin
    ) VALUES (
      p_proposal_id, v_section_id, t.document, t.kind, t.key, t.default_title, v_idx, t.anchor,
      t.is_deletable, t.is_hideable, t.is_source_fed, t.is_fixed_position, t.default_visible,
      t.source_key, t.render_group, 'auto'
    )
    ON CONFLICT (proposal_id, template_key) WHERE template_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_card_id;

    IF v_card_id IS NULL THEN CONTINUE; END IF;
    v_created := v_created + 1;

    IF t.default_fields IS NOT NULL AND jsonb_typeof(t.default_fields) = 'array' THEN
      v_pos := 0;
      FOR v_field IN SELECT * FROM jsonb_array_elements(t.default_fields) LOOP
        INSERT INTO public.card_fields (
          card_id, proposal_id, heading, content_html, order_index, field_role, origin
        ) VALUES (
          v_card_id, p_proposal_id,
          NULLIF(v_field->>'heading', ''),
          COALESCE(v_field->>'content_html', ''),
          v_pos,
          COALESCE(v_field->>'field_role', 'narrative'),
          'auto'
        );
        v_pos := v_pos + 1;
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_created;
END;
$$;

DROP FUNCTION IF EXISTS public.create_proposal_with_role(text,text,proposal_type,budget_type,text,text,text,text,timestamptz,uuid,boolean);
CREATE OR REPLACE FUNCTION public.create_proposal_with_role(
  p_acronym text, p_title text, p_type proposal_type, p_budget_type budget_type,
  p_submission_stage text DEFAULT 'full'::text, p_work_programme text DEFAULT NULL::text,
  p_destination text DEFAULT NULL::text, p_topic_url text DEFAULT NULL::text,
  p_deadline timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_template_type_id uuid DEFAULT NULL::uuid, p_uses_fstp boolean DEFAULT false,
  p_template_version_id uuid DEFAULT NULL::uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  new_proposal_id uuid;
  sec record;
  sec_id text;
  sitra_participant_id uuid;
  v_version uuid;
BEGIN
  IF NOT (public.is_global_admin(auth.uid()) OR public.caller_is_sitra_staff()) THEN
    RAISE EXCEPTION 'Permission denied: only platform owners and Sitra staff can create proposals';
  END IF;

  v_version := p_template_version_id;
  IF v_version IS NULL AND p_template_type_id IS NOT NULL THEN
    v_version := public.latest_published_template_version(p_template_type_id);
  END IF;
  IF v_version IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.template_versions
         WHERE id = v_version AND status = 'published'
           AND (p_template_type_id IS NULL OR template_type_id = p_template_type_id)) THEN
    RAISE EXCEPTION 'Unknown or unpublished template version';
  END IF;

  INSERT INTO public.proposals (
    acronym, title, type, budget_type, submission_stage, work_programme,
    destination, topic_url, deadline, template_type_id, template_version_id,
    created_by, status, uses_fstp
  ) VALUES (
    p_acronym, p_title, p_type, p_budget_type, p_submission_stage, p_work_programme,
    p_destination, p_topic_url, p_deadline, p_template_type_id, v_version,
    auth.uid(), 'draft', p_uses_fstp
  )
  RETURNING id INTO new_proposal_id;

  INSERT INTO public.user_roles (user_id, proposal_id, role)
  VALUES (auth.uid(), new_proposal_id, 'coordinator');

  INSERT INTO public.participants (
    proposal_id, organisation_name, organisation_short_name, english_name, pic_number,
    organisation_type, organisation_category, legal_entity_type, country, is_sme,
    participant_number, street, postcode, town, website
  ) VALUES (
    new_proposal_id, 'Suomen Itsenäisyyden Juhlarahasto', 'Sitra', 'The Finnish Innovation Fund', '906912365',
    'beneficiary', 'PUB', 'PUB', 'Finland', false, 1, 'Itämerenkatu 11-13', '00180', 'Helsinki', 'www.sitra.fi/en'
  )
  RETURNING id INTO sitra_participant_id;

  INSERT INTO public.participant_departments (participant_id, department_name, same_as_organisation, order_index)
  VALUES (sitra_participant_id, 'International Programmes', true, 0);

  INSERT INTO public.organisations (name, short_name, english_name, pic_number, country, organisation_category)
  VALUES ('Suomen Itsenäisyyden Juhlarahasto', 'Sitra', 'The Finnish Innovation Fund', '906912365', 'Finland', 'PUB')
  ON CONFLICT (pic_number) DO NOTHING;

  UPDATE public.wp_drafts
  SET lead_participant_id = sitra_participant_id
  WHERE proposal_id = new_proposal_id AND number = 9;

  IF p_template_type_id IS NOT NULL THEN
    FOR sec IN
      SELECT section_number FROM public.template_sections
      WHERE template_type_id = p_template_type_id
        AND section_number LIKE 'B%'
      ORDER BY order_index
    LOOP
      sec_id := lower(replace(sec.section_number, '.', '-'));
      INSERT INTO public.section_versions (proposal_id, section_id, content, created_by, version_number, is_auto_save)
      VALUES (new_proposal_id, sec_id, '', auth.uid(), 1, true);
    END LOOP;
  END IF;

  RETURN new_proposal_id;
END;
$function$;
