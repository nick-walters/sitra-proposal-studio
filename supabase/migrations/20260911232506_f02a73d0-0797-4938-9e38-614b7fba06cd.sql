-- 1. Modules may now be figures.
ALTER TABLE public.card_fields DROP CONSTRAINT card_fields_field_role_check;
ALTER TABLE public.card_fields
  ADD CONSTRAINT card_fields_field_role_check
  CHECK (field_role = ANY (ARRAY['narrative'::text, 'case_placeholder'::text, 'figure'::text]));

-- 2. A placement row may belong to a module instead of the whole block.
ALTER TABLE public.card_figure ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.card_figure
  ADD COLUMN IF NOT EXISTS field_id uuid REFERENCES public.card_fields(id) ON DELETE CASCADE;

ALTER TABLE public.card_figure DROP CONSTRAINT card_figure_pkey;
ALTER TABLE public.card_figure ADD CONSTRAINT card_figure_pkey PRIMARY KEY (id);

-- One block-level placement per block (unchanged behaviour), one per module.
CREATE UNIQUE INDEX IF NOT EXISTS card_figure_block_unique
  ON public.card_figure (card_id) WHERE field_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS card_figure_module_unique
  ON public.card_figure (field_id) WHERE field_id IS NOT NULL;

-- 3. Saving a placement: the same patch shape, optionally scoped to a module.
DROP FUNCTION IF EXISTS public.save_card_figure(uuid, jsonb);

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
  WHERE card_id = p_card_id AND field_id IS NOT DISTINCT FROM p_field_id;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

-- 4. Creating a figure module: a card_fields row plus its placement row.
CREATE OR REPLACE FUNCTION public.create_card_figure_module(p_card_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_field_id uuid;
  v_proposal uuid;
BEGIN
  v_field_id := public.create_card_field(p_card_id, NULL, '', 'figure');
  SELECT proposal_id INTO v_proposal FROM public.card_fields WHERE id = v_field_id;

  UPDATE public.card_fields SET heading_enabled = false WHERE id = v_field_id;

  INSERT INTO public.card_figure (
    card_id, proposal_id, field_id, figure_id, caption,
    float, width_mode, custom_width_pct, group_with_above, group_with_below,
    position_mode, page_break_mode
  ) VALUES (
    p_card_id, v_proposal, v_field_id, NULL, NULL,
    'none', 'full', 100, false, false,
    'below', 'auto'
  );

  RETURN v_field_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_card_figure_module(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_card_figure(uuid, jsonb, uuid) TO authenticated;