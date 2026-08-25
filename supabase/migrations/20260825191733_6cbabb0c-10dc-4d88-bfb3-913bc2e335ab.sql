-- 1. Module headers default OFF, except modules in B1.2's Methodologies block.
ALTER TABLE public.card_fields ALTER COLUMN heading_enabled SET DEFAULT false;

CREATE OR REPLACE FUNCTION public.create_card_field(p_card_id uuid, p_heading text DEFAULT NULL::text, p_content_html text DEFAULT ''::text, p_field_role text DEFAULT 'narrative'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_card public.proposal_cards%ROWTYPE;
  v_idx integer;
  v_id uuid;
BEGIN
  IF NOT public.can_edit_proposal(auth.uid(), (SELECT proposal_id FROM public.proposal_cards WHERE id = p_card_id)) THEN
    RAISE EXCEPTION 'You do not have permission to edit this proposal';
  END IF;

  SELECT * INTO v_card FROM public.proposal_cards WHERE id = p_card_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card not found'; END IF;
  IF NOT public.can_edit_proposal(auth.uid(), v_card.proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: you cannot edit this proposal';
  END IF;

  PERFORM public.resequence_card_fields(p_card_id);

  SELECT COALESCE(max(order_index), -1) + 1 INTO v_idx
    FROM public.card_fields WHERE card_id = p_card_id AND deleted_at IS NULL;

  INSERT INTO public.card_fields (card_id, proposal_id, heading, content_html, order_index, field_role, origin, heading_enabled)
  VALUES (p_card_id, v_card.proposal_id, NULLIF(btrim(COALESCE(p_heading, '')), ''), COALESCE(p_content_html, ''), v_idx, p_field_role, 'manual',
          COALESCE(v_card.template_key, '') = 'b12.methodologies')
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;
