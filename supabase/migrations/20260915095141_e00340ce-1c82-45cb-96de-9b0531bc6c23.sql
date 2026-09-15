ALTER TABLE public.card_figure
  ADD COLUMN IF NOT EXISTS caption_kind text NOT NULL DEFAULT 'figure';

ALTER TABLE public.card_figure DROP CONSTRAINT IF EXISTS card_figure_caption_kind_check;
ALTER TABLE public.card_figure
  ADD CONSTRAINT card_figure_caption_kind_check CHECK (caption_kind IN ('figure','table'));

CREATE OR REPLACE FUNCTION public.save_card_figure(p_card_id uuid, p_patch jsonb, p_field_id uuid DEFAULT NULL)
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

  IF p_patch ? 'caption_kind' AND COALESCE(NULLIF(p_patch->>'caption_kind',''),'figure') NOT IN ('figure','table') THEN
    RAISE EXCEPTION 'A caption is either a figure caption or a table caption';
  END IF;

  UPDATE public.card_figure SET
    figure_id        = CASE WHEN p_patch ? 'figure_id' THEN v_figure_id ELSE figure_id END,
    caption          = CASE WHEN p_patch ? 'caption' THEN p_patch->>'caption' ELSE caption END,
    caption_kind     = CASE WHEN p_patch ? 'caption_kind'
                            THEN COALESCE(NULLIF(p_patch->>'caption_kind', ''), 'figure') ELSE caption_kind END,
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
  WHERE card_id = p_card_id AND field_id IS NOT DISTINCT FROM p_field_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;