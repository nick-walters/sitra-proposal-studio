-- 1. Extend template_modifiers -------------------------------------------------
ALTER TABLE public.template_modifiers
  ADD COLUMN IF NOT EXISTS text_substitutions jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS non_template_effects jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.template_modifiers.conditions IS
  'When the modifier applies. Recognised keys: action_type, budget_type, work_programme, submission_stage, uses_fstp. All present keys must match (AND).';
COMMENT ON COLUMN public.template_modifiers.effects IS
  'Structural effects applied at SEEDING. Recognised keys: page_limit_delta (int, additive), funding_overrides (object), flags (object of template booleans).';
COMMENT ON COLUMN public.template_modifiers.text_substitutions IS
  'Textual effects resolved at RENDER: placeholder name -> replacement HTML, e.g. {"RANKING": "..."}.';
COMMENT ON COLUMN public.template_modifiers.non_template_effects IS
  'Declared effects OUTSIDE the Part A/B template (e.g. {"budget_sheet":"lump_sum"}). Recorded but not yet implemented by any consumer.';

-- 2. Modifier-owned template content -------------------------------------------
ALTER TABLE public.card_templates
  ADD COLUMN IF NOT EXISTS condition_modifier_codes text[];
ALTER TABLE public.card_guidelines
  ADD COLUMN IF NOT EXISTS condition_modifier_codes text[];

COMMENT ON COLUMN public.card_templates.condition_modifier_codes IS
  'NULL/empty = always seeded. Otherwise seeded only when one of these modifier codes applies to the proposal.';
COMMENT ON COLUMN public.card_guidelines.condition_modifier_codes IS
  'NULL/empty = always shown. Otherwise shown only when one of these modifier codes applies.';

-- 3. Fold work programme extensions into modifiers -----------------------------
UPDATE public.template_modifiers
   SET name = 'CBE JU',
       description = 'Circular Bio-economy JU: extended page allowance and JU funding rates.',
       effects = jsonb_build_object('page_limit_delta', 10, 'funding_overrides', jsonb_build_object('IA_company', 0.60))
 WHERE code = 'CBE_JU_EXTENSION';

UPDATE public.template_modifiers
   SET name = 'Chips JU',
       description = 'Chips JU: extended page allowance.',
       effects = jsonb_build_object('page_limit_delta', 5, 'funding_overrides', '{}'::jsonb)
 WHERE code = 'CHIPS_JU_EXTENSION';

INSERT INTO public.template_modifiers (code, name, description, conditions, effects, priority, is_active, is_admin_editable)
VALUES ('MISSIONS', 'EU Missions',
        'Requirements specific to EU Mission proposals.',
        '{"work_programme":"MISSIONS"}'::jsonb,
        '{"page_limit_delta":0,"funding_overrides":{}}'::jsonb,
        20, true, true)
ON CONFLICT (code) DO NOTHING;

UPDATE public.template_modifiers
   SET name = 'Lump sum',
       description = 'Lump sum funding: extra page allowance and a lump sum budget sheet.',
       non_template_effects = '{"budget_sheet":"lump_sum"}'::jsonb
 WHERE code = 'LUMP_SUM_PAGES';

DROP TABLE IF EXISTS public.work_programme_extensions;
ALTER TABLE public.proposal_templates DROP COLUMN IF EXISTS applied_extension_ids;

-- 4. RIA / IA ranking modifiers -------------------------------------------------
INSERT INTO public.template_modifiers (code, name, description, conditions, effects, text_substitutions, priority, is_active, is_admin_editable)
VALUES
 ('RIA_RANKING', 'RIA ranking tie-break',
  'Tie-break ranking sentence for Research and Innovation Actions.',
  '{"action_type":"RIA"}'::jsonb, '{}'::jsonb,
  jsonb_build_object('RANKING', 'For equally-ranked RIA proposals, preference is given to those with a higher score in the Excellence section, followed by Impact.'),
  100, true, true),
 ('IA_RANKING', 'IA ranking tie-break',
  'Tie-break ranking sentence for Innovation Actions.',
  '{"action_type":"IA"}'::jsonb, '{}'::jsonb,
  jsonb_build_object('RANKING', 'For equally-ranked IA proposals, preference is given to those with a higher score in the Impact section, followed by Excellence.'),
  110, true, true)
ON CONFLICT (code) DO NOTHING;

UPDATE public.card_guidelines
   SET content = regexp_replace(
         content,
         '<p style="text-align: justify;">For equally-scoring proposals.*?</p>',
         '<p style="text-align: justify;">{{RANKING}}</p>')
 WHERE id = '2e877ec8-2f40-4dc9-8682-e268bf943389';

-- 5. Seed modifier-owned blocks --------------------------------------------------
CREATE OR REPLACE FUNCTION public.seed_proposal_cards(p_proposal_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prop record;
  v_version uuid;
  v_codes text[];
  t record;
  v_section_id uuid;
  v_idx integer;
  v_card_id uuid;
  v_created integer := 0;
  v_field jsonb;
  v_pos integer;
BEGIN
  IF NOT public.can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'You do not have permission to edit this proposal';
  END IF;

  SELECT id, template_type_id, template_version_id, budget_type, type, work_programme,
         submission_stage, COALESCE(uses_fstp, false) AS uses_fstp, status
    INTO v_prop FROM public.proposals WHERE id = p_proposal_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposal not found'; END IF;
  IF NOT (public.is_coordinator_or_above(auth.uid()) AND public.is_proposal_admin(auth.uid(), p_proposal_id)) THEN
    RAISE EXCEPTION 'Permission denied: coordinator or above required';
  END IF;
  IF v_prop.template_type_id IS NULL THEN RETURN 0; END IF;

  v_version := COALESCE(v_prop.template_version_id,
                        public.latest_published_template_version(v_prop.template_type_id));
  IF v_version IS NULL THEN RETURN 0; END IF;

  SELECT COALESCE(array_agg(m.code ORDER BY m.priority, m.code), '{}')
    INTO v_codes
    FROM public.template_modifiers m
   WHERE m.is_active
     AND (m.conditions->>'budget_type'     IS NULL OR m.conditions->>'budget_type'     = v_prop.budget_type::text)
     AND (m.conditions->>'action_type'     IS NULL OR m.conditions->>'action_type'     = v_prop.type::text)
     AND (m.conditions->>'work_programme'  IS NULL OR m.conditions->>'work_programme'  = v_prop.work_programme)
     AND (m.conditions->>'submission_stage' IS NULL OR m.conditions->>'submission_stage' = v_prop.submission_stage)
     AND (m.conditions->>'uses_fstp'       IS NULL OR (m.conditions->>'uses_fstp')::boolean = v_prop.uses_fstp);

  FOR t IN
    SELECT * FROM public.card_templates
     WHERE template_version_id = v_version
       AND is_active
       AND (condition_budget_type IS NULL OR condition_budget_type = v_prop.budget_type)
       AND (condition_uses_fstp IS NULL OR condition_uses_fstp = v_prop.uses_fstp)
       AND (condition_modifier_codes IS NULL
            OR cardinality(condition_modifier_codes) = 0
            OR condition_modifier_codes && COALESCE(v_codes, '{}'))
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
      source_key, render_group, origin, title_mode
    ) VALUES (
      p_proposal_id, v_section_id, t.document, t.kind, t.key, t.default_title, v_idx, t.anchor,
      t.is_deletable, t.is_hideable, t.is_source_fed, t.is_fixed_position, t.default_visible,
      t.source_key, t.render_group, 'auto', COALESCE(t.title_mode, 'mirrored')
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
$function$;

-- 6. Lock the action type after creation ----------------------------------------
CREATE OR REPLACE FUNCTION public.lock_proposal_action_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.type IS DISTINCT FROM OLD.type THEN
    RAISE EXCEPTION 'The action type cannot be changed after a proposal is created';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_lock_proposal_action_type ON public.proposals;
CREATE TRIGGER trg_lock_proposal_action_type
BEFORE UPDATE OF type ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.lock_proposal_action_type();