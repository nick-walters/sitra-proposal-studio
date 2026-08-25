-- Escape hatch for maintenance migrations that must re-shape fixed bands.
CREATE OR REPLACE FUNCTION public.validate_proposal_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_max_head integer;
  v_min_tail integer;
  v_admin boolean := COALESCE(current_setting('app.card_admin_ok', true), '') = '1';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.document IS DISTINCT FROM OLD.document THEN
      RAISE EXCEPTION 'proposal_cards.document is immutable';
    END IF;
    IF NOT v_admin AND NEW.kind IS DISTINCT FROM OLD.kind THEN
      RAISE EXCEPTION 'proposal_cards.kind is immutable';
    END IF;
    IF NOT v_admin AND NEW.anchor IS DISTINCT FROM OLD.anchor THEN
      RAISE EXCEPTION 'proposal_cards.anchor cannot be changed';
    END IF;
    IF NOT v_admin AND OLD.anchor IN ('head','tail') AND NEW.order_index IS DISTINCT FROM OLD.order_index
       AND NEW.deleted_at IS NULL AND OLD.deleted_at IS NULL THEN
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

  IF NEW.deleted_at IS NULL THEN
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
  ELSIF NEW.order_index < 10000 AND NEW.anchor = 'free' THEN
    NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

SELECT set_config('app.card_admin_ok', '1', true);

-- ── 1. Canonical B3.1 block sequence in the template library ────────────────
WITH v(key, title, ord, anchor, fixed, src, kind, source_key) AS (
  VALUES
    ('b31.intro',      'Overall structure of the work plan',        0,    'head', false, false, 'text',       NULL),
    ('b31.table_a',    'Table 3.1.a — List of work packages',       1000, 'tail', true,  true,  'text',       'b31.table_a'),
    ('b31.pert',       'Figure 3.1.a — Pert chart',                 1010, 'tail', true,  true,  'figure',     'b31.pert'),
    ('b31.gantt',      'Figure 3.1.b — Gantt chart',                1020, 'tail', true,  true,  'figure',     'b31.gantt'),
    ('b31.table_b',    'Table 3.1.b — Work package descriptions',   1030, 'tail', true,  true,  'text',       'b31.table_b'),
    ('b31.table_c',    'Table 3.1.c — List of deliverables',        1040, 'tail', true,  true,  'text',       'b31.table_c'),
    ('b31.table_d',    'Table 3.1.d — List of milestones',          1050, 'tail', true,  true,  'text',       'b31.table_d'),
    ('b31.table_e',    'Table 3.1.e — Critical risks',              1060, 'tail', true,  true,  'text',       'b31.table_e'),
    ('b31.table_f',    'Table 3.1.f — Summary of staff effort',     1070, 'tail', true,  true,  'text',       'b31.table_f'),
    ('b31.table_g',    'Table 3.1.g — Subcontracting costs',        1080, 'tail', true,  true,  'text',       'b31.table_g'),
    ('b31.table_h',    'Table 3.1.h — Purchase costs',              1090, 'tail', true,  true,  'text',       'b31.table_h'),
    ('b31.references', 'References',                                1100, 'tail', false, true,  'references', 'b31.references')
)
UPDATE public.card_templates ct SET
  default_title     = v.title,
  order_index       = v.ord,
  anchor            = v.anchor,
  is_deletable      = false,
  is_hideable       = true,
  is_fixed_position = v.fixed,
  is_source_fed     = v.src,
  kind              = v.kind,
  source_key        = v.source_key,
  updated_at        = now()
FROM v
WHERE ct.section_number IN ('B3.1', '3.1') AND ct.key = v.key;

-- ── 2. Same shape on the blocks already seeded on live proposals ────────────
WITH v(key, title, ord, anchor, fixed, src, kind, source_key) AS (
  VALUES
    ('b31.intro',      'Overall structure of the work plan',        0,    'head', false, false, 'text',       NULL),
    ('b31.table_a',    'Table 3.1.a — List of work packages',       1000, 'tail', true,  true,  'text',       'b31.table_a'),
    ('b31.pert',       'Figure 3.1.a — Pert chart',                 1010, 'tail', true,  true,  'figure',     'b31.pert'),
    ('b31.gantt',      'Figure 3.1.b — Gantt chart',                1020, 'tail', true,  true,  'figure',     'b31.gantt'),
    ('b31.table_b',    'Table 3.1.b — Work package descriptions',   1030, 'tail', true,  true,  'text',       'b31.table_b'),
    ('b31.table_c',    'Table 3.1.c — List of deliverables',        1040, 'tail', true,  true,  'text',       'b31.table_c'),
    ('b31.table_d',    'Table 3.1.d — List of milestones',          1050, 'tail', true,  true,  'text',       'b31.table_d'),
    ('b31.table_e',    'Table 3.1.e — Critical risks',              1060, 'tail', true,  true,  'text',       'b31.table_e'),
    ('b31.table_f',    'Table 3.1.f — Summary of staff effort',     1070, 'tail', true,  true,  'text',       'b31.table_f'),
    ('b31.table_g',    'Table 3.1.g — Subcontracting costs',        1080, 'tail', true,  true,  'text',       'b31.table_g'),
    ('b31.table_h',    'Table 3.1.h — Purchase costs',              1090, 'tail', true,  true,  'text',       'b31.table_h'),
    ('b31.references', 'References',                                1100, 'tail', false, true,  'references', 'b31.references')
)
UPDATE public.proposal_cards pc SET
  title             = v.title,
  order_index       = v.ord,
  anchor            = v.anchor,
  is_deletable      = false,
  is_hideable       = true,
  is_fixed_position = v.fixed,
  is_source_fed     = v.src,
  kind              = v.kind,
  source_key        = v.source_key,
  updated_at        = now()
FROM v, public.proposal_template_sections pts
WHERE pc.section_id = pts.id
  AND pts.section_number IN ('B3.1', '3.1')
  AND pc.template_key = v.key;

-- ── 3. Purchase-costs block visibility mirrors the A3 booleans ──────────────
UPDATE public.proposal_cards pc
SET is_visible = p.b31_show_purchase_costs
FROM public.proposals p
WHERE pc.proposal_id = p.id AND pc.template_key = 'b31.table_h';

CREATE OR REPLACE FUNCTION public.b31_mirror_card_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.template_key = 'b31.table_h' AND NEW.is_visible IS DISTINCT FROM OLD.is_visible THEN
    UPDATE public.proposals SET
      b31_show_purchase_costs            = NEW.is_visible,
      b31_show_travel_justification      = NEW.is_visible,
      b31_show_equipment_justification   = NEW.is_visible,
      b31_show_other_goods_justification = NEW.is_visible,
      updated_at = now()
    WHERE id = NEW.proposal_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_b31_mirror_card_visibility ON public.proposal_cards;
CREATE TRIGGER trg_b31_mirror_card_visibility
AFTER UPDATE OF is_visible ON public.proposal_cards
FOR EACH ROW EXECUTE FUNCTION public.b31_mirror_card_visibility();

-- ── 4. SUSIE-Q: legacy B3.1 paragraph into block 1 ──────────────────────────
UPDATE public.card_fields cf
SET content_html = sc.content, updated_at = now()
FROM public.proposal_cards pc, public.section_content sc
WHERE cf.card_id = pc.id
  AND pc.proposal_id = 'af325ea2-ae8c-4f59-8625-283d5437efba'
  AND pc.template_key = 'b31.intro'
  AND cf.deleted_at IS NULL
  AND cf.order_index = 0
  AND regexp_replace(coalesce(cf.content_html, ''), '<[^>]*>|&nbsp;|\s', '', 'g') = ''
  AND sc.proposal_id = pc.proposal_id
  AND sc.section_id = 'b3-1';