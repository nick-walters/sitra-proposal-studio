CREATE OR REPLACE FUNCTION public.reconcile_citation_instances(p_proposal_id uuid, p_field_id uuid, p_card_id uuid, p_ref_keys integer[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_written integer := 0;
  v_owner uuid;
BEGIN
  IF NOT can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'not authorised to edit this proposal';
  END IF;

  IF (p_field_id IS NULL) = (p_card_id IS NULL) AND p_field_id IS NULL THEN
    RAISE EXCEPTION 'an anchor is required';
  END IF;

  -- The anchor must belong to the proposal the caller was authorised against.
  IF p_field_id IS NOT NULL THEN
    SELECT cf.proposal_id INTO v_owner FROM public.card_fields cf WHERE cf.id = p_field_id;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'field % does not exist', p_field_id;
    END IF;
    IF v_owner <> p_proposal_id THEN
      RAISE EXCEPTION 'field % belongs to proposal %, not %', p_field_id, v_owner, p_proposal_id;
    END IF;
  END IF;

  IF p_card_id IS NOT NULL THEN
    SELECT pc.proposal_id INTO v_owner FROM public.proposal_cards pc WHERE pc.id = p_card_id;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'card % does not exist', p_card_id;
    END IF;
    IF v_owner <> p_proposal_id THEN
      RAISE EXCEPTION 'card % belongs to proposal %, not %', p_card_id, v_owner, p_proposal_id;
    END IF;
  END IF;

  IF p_field_id IS NOT NULL THEN
    DELETE FROM public.citation_instances WHERE field_id = p_field_id;
  ELSE
    DELETE FROM public.citation_instances WHERE card_id = p_card_id AND field_id IS NULL;
  END IF;

  INSERT INTO public.citation_instances (proposal_id, reference_id, field_id, card_id, position)
  SELECT p_proposal_id, r.id, p_field_id, p_card_id, k.ord - 1
  FROM unnest(coalesce(p_ref_keys, '{}'::integer[])) WITH ORDINALITY AS k(ref_key, ord)
  JOIN public.proposal_references r
    ON r.proposal_id = p_proposal_id AND r.ref_key = k.ref_key;

  GET DIAGNOSTICS v_written = ROW_COUNT;
  RETURN v_written;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reconcile_citation_instances(uuid, uuid, uuid, integer[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_citation_instances(uuid, uuid, uuid, integer[]) TO authenticated;