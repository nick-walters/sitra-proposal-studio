-- ── 1. Remove the table-block feature ────────────────────────────────────────
DROP FUNCTION IF EXISTS public.create_table_card(uuid, integer, integer, integer);
DROP FUNCTION IF EXISTS public.add_card_table_row(uuid, integer, text);
DROP FUNCTION IF EXISTS public.delete_card_table_row(uuid);
DROP FUNCTION IF EXISTS public.add_card_table_column(uuid, integer);
DROP FUNCTION IF EXISTS public.delete_card_table_column(uuid);
DROP FUNCTION IF EXISTS public.save_card_table_column(uuid, jsonb);
DROP FUNCTION IF EXISTS public.save_card_table_cell(uuid, jsonb);
DROP FUNCTION IF EXISTS public.save_card_table_meta(uuid, jsonb);

DROP TABLE IF EXISTS public.card_table_cells;
DROP TABLE IF EXISTS public.card_table_rows;
DROP TABLE IF EXISTS public.card_table_columns;
DROP TABLE IF EXISTS public.card_table;

-- 'table' REMAINS a permitted proposal_cards.kind: source-fed blocks use it.

-- ── 2. Figure block placement, sizing and break controls ─────────────────────
-- These live on card_figure, not proposal_cards: they describe how the FIGURE
-- occupies the text column, and only figure blocks have them.
ALTER TABLE public.card_figure
  ADD COLUMN IF NOT EXISTS width_pct numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS placement text NOT NULL DEFAULT 'full_width',
  ADD COLUMN IF NOT EXISTS break_before boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS keep_with_next boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS keep_whole boolean NOT NULL DEFAULT true;

ALTER TABLE public.card_figure
  DROP CONSTRAINT IF EXISTS card_figure_width_pct_check,
  ADD CONSTRAINT card_figure_width_pct_check CHECK (width_pct > 0 AND width_pct <= 100);

ALTER TABLE public.card_figure
  DROP CONSTRAINT IF EXISTS card_figure_placement_check,
  ADD CONSTRAINT card_figure_placement_check
    CHECK (placement IN ('full_width', 'beside_next', 'top_of_page'));

CREATE OR REPLACE FUNCTION public.save_card_figure(p_card_id uuid, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_proposal_id uuid := public.card_block_guard(p_card_id);
  v_figure_id uuid;
BEGIN
  IF p_patch ? 'figure_id' THEN
    v_figure_id := NULLIF(p_patch->>'figure_id', '')::uuid;
    IF v_figure_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.figures f WHERE f.id = v_figure_id AND f.proposal_id = v_proposal_id
    ) THEN
      RAISE EXCEPTION 'Figure not found in this proposal';
    END IF;
  END IF;

  UPDATE public.card_figure SET
    figure_id      = CASE WHEN p_patch ? 'figure_id' THEN v_figure_id ELSE figure_id END,
    caption        = CASE WHEN p_patch ? 'caption' THEN p_patch->>'caption' ELSE caption END,
    float          = CASE WHEN p_patch ? 'float' THEN COALESCE(NULLIF(p_patch->>'float', ''), 'none') ELSE float END,
    max_width_cm   = CASE WHEN p_patch ? 'max_width_cm'
                          THEN NULLIF(p_patch->>'max_width_cm', '')::numeric ELSE max_width_cm END,
    width_pct      = CASE WHEN p_patch ? 'width_pct'
                          THEN COALESCE(NULLIF(p_patch->>'width_pct', '')::numeric, 100) ELSE width_pct END,
    placement      = CASE WHEN p_patch ? 'placement'
                          THEN COALESCE(NULLIF(p_patch->>'placement', ''), 'full_width') ELSE placement END,
    break_before   = CASE WHEN p_patch ? 'break_before'
                          THEN COALESCE((p_patch->>'break_before')::boolean, false) ELSE break_before END,
    keep_with_next = CASE WHEN p_patch ? 'keep_with_next'
                          THEN COALESCE((p_patch->>'keep_with_next')::boolean, false) ELSE keep_with_next END,
    keep_whole     = CASE WHEN p_patch ? 'keep_whole'
                          THEN COALESCE((p_patch->>'keep_whole')::boolean, true) ELSE keep_whole END,
    updated_at     = now()
  WHERE card_id = p_card_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_card_figure(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_card_figure(uuid, jsonb) TO authenticated;

-- ── 3. Section-level rule: every figure and table is full width ──────────────
-- Expressed as a template property so any section can declare it, rather than
-- hardcoding the B3.1 section id in the client.
ALTER TABLE public.template_sections
  ADD COLUMN IF NOT EXISTS figures_full_width boolean NOT NULL DEFAULT false;
ALTER TABLE public.proposal_template_sections
  ADD COLUMN IF NOT EXISTS figures_full_width boolean NOT NULL DEFAULT false;

UPDATE public.template_sections SET figures_full_width = true WHERE section_number IN ('3.1', 'B3.1');
UPDATE public.proposal_template_sections SET figures_full_width = true WHERE section_number IN ('3.1', 'B3.1');