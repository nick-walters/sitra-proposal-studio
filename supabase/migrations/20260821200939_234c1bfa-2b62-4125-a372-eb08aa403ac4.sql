ALTER TABLE public.card_figure
  ADD COLUMN IF NOT EXISTS width_mode text NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS custom_width_pct numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS group_with_above boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS group_with_below boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS position_mode text NOT NULL DEFAULT 'below',
  ADD COLUMN IF NOT EXISTS page_break_mode text NOT NULL DEFAULT 'auto';

UPDATE public.card_figure
SET width_mode = CASE
      WHEN width_pct >= 100 THEN 'full'
      WHEN width_pct BETWEEN 60 AND 70 THEN 'two_thirds'
      WHEN width_pct = 50 THEN 'half'
      WHEN width_pct BETWEEN 30 AND 35 THEN 'one_third'
      WHEN width_pct = 25 THEN 'one_quarter'
      ELSE 'custom'
    END,
    custom_width_pct = LEAST(GREATEST(COALESCE(width_pct, 100), 1), 100),
    position_mode = CASE WHEN placement = 'beside_next' THEN 'right_wrap' ELSE 'below' END,
    page_break_mode = CASE
      WHEN break_before THEN 'next_page'
      WHEN placement = 'top_of_page' THEN 'float_top'
      ELSE 'auto'
    END,
    group_with_below = COALESCE(keep_with_next, false);

ALTER TABLE public.card_figure
  DROP CONSTRAINT IF EXISTS card_figure_width_mode_check,
  ADD CONSTRAINT card_figure_width_mode_check
    CHECK (width_mode IN ('full', 'two_thirds', 'half', 'one_third', 'one_quarter', 'custom'));

ALTER TABLE public.card_figure
  DROP CONSTRAINT IF EXISTS card_figure_custom_width_pct_check,
  ADD CONSTRAINT card_figure_custom_width_pct_check
    CHECK (custom_width_pct > 0 AND custom_width_pct <= 100);

ALTER TABLE public.card_figure
  DROP CONSTRAINT IF EXISTS card_figure_position_mode_check,
  ADD CONSTRAINT card_figure_position_mode_check
    CHECK (position_mode IN ('below', 'right_wrap', 'left_wrap'));

ALTER TABLE public.card_figure
  DROP CONSTRAINT IF EXISTS card_figure_page_break_mode_check,
  ADD CONSTRAINT card_figure_page_break_mode_check
    CHECK (page_break_mode IN ('auto', 'keep_where_it_lands', 'float_top', 'next_page'));

COMMENT ON TABLE public.card_figure IS
  'Figure block layout. UNCONDITIONAL RULE: a figure never splits across pages and is never separated from its caption; there is deliberately no keep-whole flag.';

ALTER TABLE public.card_figure
  DROP COLUMN IF EXISTS placement,
  DROP COLUMN IF EXISTS width_pct,
  DROP COLUMN IF EXISTS break_before,
  DROP COLUMN IF EXISTS keep_with_next,
  DROP COLUMN IF EXISTS keep_whole;

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
    figure_id        = CASE WHEN p_patch ? 'figure_id' THEN v_figure_id ELSE figure_id END,
    caption          = CASE WHEN p_patch ? 'caption' THEN p_patch->>'caption' ELSE caption END,
    float            = CASE WHEN p_patch ? 'float' THEN COALESCE(NULLIF(p_patch->>'float', ''), 'none') ELSE float END,
    max_width_cm     = CASE WHEN p_patch ? 'max_width_cm'
                            THEN NULLIF(p_patch->>'max_width_cm', '')::numeric ELSE max_width_cm END,
    width_mode       = CASE WHEN p_patch ? 'width_mode'
                            THEN COALESCE(NULLIF(p_patch->>'width_mode', ''), 'full') ELSE width_mode END,
    custom_width_pct = CASE WHEN p_patch ? 'custom_width_pct'
                            THEN COALESCE(NULLIF(p_patch->>'custom_width_pct', '')::numeric, 100)
                            ELSE custom_width_pct END,
    group_with_above = CASE WHEN p_patch ? 'group_with_above'
                            THEN COALESCE((p_patch->>'group_with_above')::boolean, false) ELSE group_with_above END,
    group_with_below = CASE WHEN p_patch ? 'group_with_below'
                            THEN COALESCE((p_patch->>'group_with_below')::boolean, false) ELSE group_with_below END,
    position_mode    = CASE WHEN p_patch ? 'position_mode'
                            THEN COALESCE(NULLIF(p_patch->>'position_mode', ''), 'below') ELSE position_mode END,
    page_break_mode  = CASE WHEN p_patch ? 'page_break_mode'
                            THEN COALESCE(NULLIF(p_patch->>'page_break_mode', ''), 'auto') ELSE page_break_mode END,
    updated_at       = now()
  WHERE card_id = p_card_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.save_card_figure(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_card_figure(uuid, jsonb) TO authenticated;