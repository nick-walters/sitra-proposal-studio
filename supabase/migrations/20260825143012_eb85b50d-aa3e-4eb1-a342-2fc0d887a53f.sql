-- 1. B1.1 gains a Background block, first in the section, deletable, hideable, no guidance.
INSERT INTO public.card_templates (
  template_type_id, template_version_id, section_source_id, section_number, document,
  key, kind, default_title, anchor, order_index,
  is_deletable, is_hideable, is_source_fed, is_fixed_position, default_visible,
  title_mode, is_active
)
SELECT DISTINCT ON (c.template_version_id)
  c.template_type_id, c.template_version_id, c.section_source_id, 'B1.1', c.document,
  'b11.background', 'text', 'Background', 'free', 100,
  true, true, false, false, true,
  'mirrored', true
FROM public.card_templates c
WHERE c.section_number = 'B1.1' AND c.key = 'b11.objectives'
  AND NOT EXISTS (
    SELECT 1 FROM public.card_templates x
    WHERE x.template_version_id = c.template_version_id AND x.key = 'b11.background'
  );

UPDATE public.card_templates
SET order_index = 101
WHERE key = 'b11.objectives' AND order_index = 100;

-- 2. Existing proposals: shift the free band down one, then insert Background at 100.
WITH tgt AS (
  SELECT DISTINCT pc.section_id
  FROM public.proposal_cards pc
  WHERE pc.template_key = 'b11.objectives'
    AND NOT EXISTS (
      SELECT 1 FROM public.proposal_cards x
      WHERE x.section_id = pc.section_id AND x.template_key = 'b11.background'
    )
)
UPDATE public.proposal_cards pc
SET order_index = pc.order_index + 1
FROM tgt
WHERE pc.section_id = tgt.section_id AND pc.anchor = 'free';

WITH tgt AS (
  SELECT pc.proposal_id, pc.section_id
  FROM public.proposal_cards pc
  WHERE pc.template_key = 'b11.objectives'
    AND NOT EXISTS (
      SELECT 1 FROM public.proposal_cards x
      WHERE x.section_id = pc.section_id AND x.template_key = 'b11.background'
    )
), ins AS (
  INSERT INTO public.proposal_cards (
    proposal_id, section_id, document, kind, template_key, title, order_index,
    anchor, is_deletable, is_hideable, is_source_fed, is_fixed_position,
    is_visible, origin, title_mode
  )
  SELECT proposal_id, section_id, 'part_b', 'text', 'b11.background', 'Background', 100,
         'free', true, true, false, false, true, 'auto', 'mirrored'
  FROM tgt
  RETURNING id, proposal_id
)
INSERT INTO public.card_fields (card_id, proposal_id, content_html, order_index, field_role, origin)
SELECT id, proposal_id, '', 0, 'narrative', 'auto' FROM ins;

-- 3. B3.2 block visibility becomes the control for the five A2 mirror booleans.
CREATE OR REPLACE FUNCTION public.b32_mirror_card_visibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.is_visible IS DISTINCT FROM OLD.is_visible THEN
    IF NEW.template_key = 'b32.capacity' THEN
      UPDATE public.proposals SET
        mirror_contribution_resources = NEW.is_visible,
        mirror_infrastructure         = NEW.is_visible,
        updated_at = now()
      WHERE id = NEW.proposal_id;
    ELSIF NEW.template_key = 'b32.value_chain_industrial' THEN
      UPDATE public.proposals SET
        mirror_value_chain            = NEW.is_visible,
        mirror_industrial_involvement = NEW.is_visible,
        updated_at = now()
      WHERE id = NEW.proposal_id;
    ELSIF NEW.template_key = 'b32.other_countries' THEN
      UPDATE public.proposals SET
        mirror_participation_justification = NEW.is_visible,
        updated_at = now()
      WHERE id = NEW.proposal_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.b32_mirror_card_visibility() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_b32_mirror_card_visibility ON public.proposal_cards;
CREATE TRIGGER trg_b32_mirror_card_visibility
AFTER UPDATE OF is_visible ON public.proposal_cards
FOR EACH ROW EXECUTE FUNCTION public.b32_mirror_card_visibility();

UPDATE public.proposal_cards pc
SET is_visible = CASE pc.template_key
    WHEN 'b32.capacity' THEN (p.mirror_contribution_resources OR p.mirror_infrastructure)
    WHEN 'b32.value_chain_industrial' THEN (p.mirror_value_chain OR p.mirror_industrial_involvement)
    WHEN 'b32.other_countries' THEN p.mirror_participation_justification
  END
FROM public.proposals p
WHERE pc.proposal_id = p.id
  AND pc.template_key IN ('b32.capacity','b32.value_chain_industrial','b32.other_countries');