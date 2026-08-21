-- `ref_key` is the stable internal id a citation carries in `data-citation`.
-- It was minted client-side as max+1 with nothing stopping two browsers from
-- picking the same value, which would silently merge two references into one
-- citation. Verified duplicate-free before adding the constraint.
ALTER TABLE public.proposal_references
  ADD CONSTRAINT proposal_references_proposal_ref_key_unique UNIQUE (proposal_id, ref_key);

-- Server-side minting: takes a per-proposal advisory lock so concurrent adds
-- serialise instead of racing on max+1.
CREATE OR REPLACE FUNCTION public.add_proposal_reference(
  p_proposal_id uuid,
  p_title text,
  p_formatted_citation text DEFAULT NULL,
  p_doi text DEFAULT NULL,
  p_authors text[] DEFAULT NULL,
  p_year integer DEFAULT NULL,
  p_journal text DEFAULT NULL,
  p_volume text DEFAULT NULL,
  p_pages text DEFAULT NULL,
  p_verified boolean DEFAULT true
)
RETURNS public.proposal_references
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.proposal_references;
  v_next integer;
BEGIN
  IF NOT public.can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'Not authorised to edit this proposal';
  END IF;
  IF p_title IS NULL OR btrim(p_title) = '' THEN
    RAISE EXCEPTION 'A reference must have a title';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('proposal_references:' || p_proposal_id::text));

  SELECT coalesce(max(ref_key), 0) + 1 INTO v_next
  FROM public.proposal_references
  WHERE proposal_id = p_proposal_id;

  INSERT INTO public.proposal_references (
    proposal_id, ref_key, doi, authors, year, title, journal, volume, pages,
    formatted_citation, verified
  ) VALUES (
    p_proposal_id, v_next, p_doi, p_authors, p_year, p_title, p_journal, p_volume,
    p_pages, p_formatted_citation, coalesce(p_verified, true)
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.add_proposal_reference(uuid, text, text, text, text[], integer, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_proposal_reference(uuid, text, text, text, text[], integer, text, text, text, boolean) TO authenticated;