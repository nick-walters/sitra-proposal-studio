-- Rewrites the derived citation index for ONE anchor (a field, or a block for
-- content not held in a field). Runs as definer because `authenticated` has no
-- DELETE grant on citation_instances: replacing the set is the only permitted
-- way to remove rows, which keeps the index honest — it can only ever be a
-- mirror of the HTML the reconciler was handed.
CREATE OR REPLACE FUNCTION public.reconcile_citation_instances(
  p_proposal_id uuid,
  p_field_id uuid,
  p_card_id uuid,
  p_ref_keys integer[]
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_written integer := 0;
BEGIN
  IF NOT can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'not authorised to edit this proposal';
  END IF;

  IF (p_field_id IS NULL) = (p_card_id IS NULL) AND p_field_id IS NULL THEN
    RAISE EXCEPTION 'an anchor is required';
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
$$;

REVOKE EXECUTE ON FUNCTION public.reconcile_citation_instances(uuid, uuid, uuid, integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_citation_instances(uuid, uuid, uuid, integer[]) TO authenticated;