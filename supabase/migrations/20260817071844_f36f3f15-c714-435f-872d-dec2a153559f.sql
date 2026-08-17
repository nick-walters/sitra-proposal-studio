-- ============ TABLES ============

CREATE TABLE public.proposal_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.proposal_template_sections(id) ON DELETE CASCADE,
  document text NOT NULL DEFAULT 'part_b' CHECK (document IN ('part_b','fstp_annex')),
  kind text NOT NULL CHECK (kind IN ('text','figure','table','outcome_list','references')),
  template_key text NULL,
  title text NULL,
  order_index integer NOT NULL,
  anchor text NOT NULL DEFAULT 'free' CHECK (anchor IN ('head','free','tail')),
  is_deletable boolean NOT NULL DEFAULT true,
  is_hideable boolean NOT NULL DEFAULT true,
  is_source_fed boolean NOT NULL DEFAULT false,
  is_fixed_position boolean NOT NULL DEFAULT false,
  is_visible boolean NOT NULL DEFAULT true,
  source_key text NULL,
  render_group text NULL,
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('auto','manual')),
  deleted_at timestamptz NULL,
  deleted_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_cards_section_order_key UNIQUE (section_id, order_index) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT proposal_cards_title_not_empty CHECK (title IS NULL OR length(btrim(title)) > 0)
);

CREATE UNIQUE INDEX proposal_cards_template_key_uniq
  ON public.proposal_cards (proposal_id, template_key) WHERE template_key IS NOT NULL;
CREATE INDEX idx_proposal_cards_lookup
  ON public.proposal_cards (proposal_id, section_id, deleted_at, order_index);
CREATE INDEX idx_proposal_cards_deleted
  ON public.proposal_cards (proposal_id) WHERE deleted_at IS NOT NULL;

CREATE TABLE public.card_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.proposal_cards(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  heading text NULL,
  content_html text,
  order_index integer NOT NULL,
  field_role text NOT NULL DEFAULT 'narrative' CHECK (field_role IN ('narrative','case_placeholder')),
  placeholder_case_type_id uuid NULL REFERENCES public.proposal_case_types(id) ON DELETE SET NULL,
  assigned_participant_id uuid NULL REFERENCES public.participants(id) ON DELETE SET NULL,
  origin text NOT NULL DEFAULT 'manual' CHECK (origin IN ('auto','manual')),
  deleted_at timestamptz NULL,
  deleted_by uuid NULL,
  deleted_with_card boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_fields_card_order_key UNIQUE (card_id, order_index) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX idx_card_fields_lookup ON public.card_fields (card_id, deleted_at, order_index);
CREATE INDEX idx_card_fields_proposal ON public.card_fields (proposal_id);

CREATE TABLE public.card_field_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id uuid NOT NULL REFERENCES public.card_fields(id) ON DELETE RESTRICT,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  content_html text,
  heading text,
  is_auto_save boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_field_versions_unique UNIQUE (field_id, version_number)
);
CREATE INDEX idx_card_field_versions_field ON public.card_field_versions (field_id, version_number DESC);

CREATE TABLE public.card_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  section_id uuid NULL REFERENCES public.proposal_template_sections(id) ON DELETE CASCADE,
  target_type text NOT NULL CHECK (target_type IN ('card','field')),
  target_id uuid NOT NULL,
  parent_card_id uuid NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  deleted_by uuid NULL,
  purge_after timestamptz NULL,
  restored_at timestamptz NULL,
  restored_by uuid NULL
);
CREATE INDEX idx_card_deletions_bin ON public.card_deletions (proposal_id, restored_at, deleted_at);
CREATE INDEX idx_card_deletions_purge ON public.card_deletions (purge_after) WHERE restored_at IS NULL;

CREATE TABLE public.card_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_type_id uuid NOT NULL REFERENCES public.template_types(id) ON DELETE CASCADE,
  section_source_id uuid NULL REFERENCES public.template_sections(id) ON DELETE SET NULL,
  section_number text NOT NULL,
  document text NOT NULL DEFAULT 'part_b' CHECK (document IN ('part_b','fstp_annex')),
  key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('text','figure','table','outcome_list','references')),
  default_title text NULL,
  anchor text NOT NULL DEFAULT 'free' CHECK (anchor IN ('head','free','tail')),
  order_index integer NOT NULL,
  is_deletable boolean NOT NULL DEFAULT true,
  is_hideable boolean NOT NULL DEFAULT true,
  is_source_fed boolean NOT NULL DEFAULT false,
  is_fixed_position boolean NOT NULL DEFAULT false,
  default_visible boolean NOT NULL DEFAULT true,
  source_key text NULL,
  render_group text NULL,
  condition_budget_type public.budget_type NULL,
  condition_uses_fstp boolean NULL,
  default_fields jsonb NULL,
  default_table jsonb NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_templates_type_key_uniq UNIQUE (template_type_id, key)
);
CREATE INDEX idx_card_templates_lookup
  ON public.card_templates (template_type_id, document, section_number, anchor, order_index);

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE ON public.proposal_cards TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.card_fields TO authenticated;
GRANT SELECT, INSERT ON public.card_field_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.card_deletions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.card_templates TO authenticated;
GRANT ALL ON public.proposal_cards TO service_role;
GRANT ALL ON public.card_fields TO service_role;
GRANT ALL ON public.card_field_versions TO service_role;
GRANT ALL ON public.card_deletions TO service_role;
GRANT ALL ON public.card_templates TO service_role;

-- ============ RLS ============
ALTER TABLE public.proposal_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_field_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view cards" ON public.proposal_cards FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Editors can insert cards" ON public.proposal_cards FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));
CREATE POLICY "Editors can update cards" ON public.proposal_cards FOR UPDATE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Members can view card fields" ON public.card_fields FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Editors can insert card fields" ON public.card_fields FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));
CREATE POLICY "Editors can update card fields" ON public.card_fields FOR UPDATE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Members can view card field versions" ON public.card_field_versions FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Editors can insert card field versions" ON public.card_field_versions FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Members can view card deletions" ON public.card_deletions FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Proposal admins can insert card deletions" ON public.card_deletions FOR INSERT TO authenticated
  WITH CHECK (public.is_proposal_admin(auth.uid(), proposal_id));
CREATE POLICY "Proposal admins can update card deletions" ON public.card_deletions FOR UPDATE TO authenticated
  USING (public.is_proposal_admin(auth.uid(), proposal_id))
  WITH CHECK (public.is_proposal_admin(auth.uid(), proposal_id));

CREATE POLICY "Authenticated users can view card templates" ON public.card_templates FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Global admins can insert card templates" ON public.card_templates FOR INSERT TO authenticated
  WITH CHECK (public.is_global_admin(auth.uid()));
CREATE POLICY "Global admins can update card templates" ON public.card_templates FOR UPDATE TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

-- ============ TRIGGERS ============
CREATE TRIGGER trg_proposal_cards_updated_at BEFORE UPDATE ON public.proposal_cards
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_card_fields_updated_at BEFORE UPDATE ON public.card_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_card_templates_updated_at BEFORE UPDATE ON public.card_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.validate_proposal_card()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_max_head integer;
  v_min_tail integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.document IS DISTINCT FROM OLD.document THEN
      RAISE EXCEPTION 'proposal_cards.document is immutable';
    END IF;
    IF NEW.kind IS DISTINCT FROM OLD.kind THEN
      RAISE EXCEPTION 'proposal_cards.kind is immutable';
    END IF;
    IF NEW.anchor IS DISTINCT FROM OLD.anchor THEN
      RAISE EXCEPTION 'proposal_cards.anchor cannot be changed';
    END IF;
    IF OLD.anchor IN ('head','tail') AND NEW.order_index IS DISTINCT FROM OLD.order_index THEN
      RAISE EXCEPTION 'Cards in the % band cannot be reordered', OLD.anchor;
    END IF;
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       AND COALESCE(current_setting('app.card_bin_ok', true), '') <> '1' THEN
      RAISE EXCEPTION 'deleted_at may only be changed by the card recycle-bin functions';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NOT NULL AND COALESCE(current_setting('app.card_bin_ok', true), '') <> '1' THEN
      RAISE EXCEPTION 'deleted_at may only be set by the card recycle-bin functions';
    END IF;
  END IF;

  IF NEW.is_fixed_position AND (NEW.is_deletable OR NEW.anchor = 'free') THEN
    RAISE EXCEPTION 'Fixed-position cards must be non-deletable and anchored to head or tail';
  END IF;

  IF NEW.anchor = 'head' AND (NEW.order_index < 0 OR NEW.order_index > 99) THEN
    RAISE EXCEPTION 'Head-band cards require order_index 0-99 (got %)', NEW.order_index;
  ELSIF NEW.anchor = 'free' AND (NEW.order_index < 100 OR NEW.order_index > 999) THEN
    RAISE EXCEPTION 'Free-band cards require order_index 100-999 (got %)', NEW.order_index;
  ELSIF NEW.anchor = 'tail' AND NEW.order_index < 1000 THEN
    RAISE EXCEPTION 'Tail-band cards require order_index >= 1000 (got %)', NEW.order_index;
  END IF;

  IF NEW.anchor = 'free' THEN
    SELECT max(order_index) INTO v_max_head FROM public.proposal_cards
      WHERE section_id = NEW.section_id AND anchor = 'head' AND deleted_at IS NULL;
    SELECT min(order_index) INTO v_min_tail FROM public.proposal_cards
      WHERE section_id = NEW.section_id AND anchor = 'tail' AND deleted_at IS NULL;
    IF v_max_head IS NOT NULL AND NEW.order_index <= v_max_head THEN
      RAISE EXCEPTION 'A free card cannot be placed above the head band';
    END IF;
    IF v_min_tail IS NOT NULL AND NEW.order_index >= v_min_tail THEN
      RAISE EXCEPTION 'A free card cannot be placed within or below the tail band';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_proposal_card
  BEFORE INSERT OR UPDATE ON public.proposal_cards
  FOR EACH ROW EXECUTE FUNCTION public.validate_proposal_card();

CREATE OR REPLACE FUNCTION public.validate_card_field()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
     AND COALESCE(current_setting('app.card_bin_ok', true), '') <> '1' THEN
    RAISE EXCEPTION 'deleted_at may only be changed by the card recycle-bin functions';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.deleted_at IS NOT NULL
     AND COALESCE(current_setting('app.card_bin_ok', true), '') <> '1' THEN
    RAISE EXCEPTION 'deleted_at may only be set by the card recycle-bin functions';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_card_field
  BEFORE INSERT OR UPDATE ON public.card_fields
  FOR EACH ROW EXECUTE FUNCTION public.validate_card_field();

CREATE OR REPLACE FUNCTION public.prevent_card_field_version_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'card_field_versions rows are immutable';
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_card_field_version_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF COALESCE(current_setting('app.card_bin_ok', true), '') = '1' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'card_field_versions rows cannot be deleted';
END;
$$;

CREATE TRIGGER trg_card_field_versions_no_update
  BEFORE UPDATE ON public.card_field_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_card_field_version_update();
CREATE TRIGGER trg_card_field_versions_no_delete
  BEFORE DELETE ON public.card_field_versions
  FOR EACH ROW EXECUTE FUNCTION public.prevent_card_field_version_delete();