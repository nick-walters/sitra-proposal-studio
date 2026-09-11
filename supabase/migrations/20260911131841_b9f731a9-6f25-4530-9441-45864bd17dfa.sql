CREATE OR REPLACE FUNCTION public.resequence_participants(p_proposal_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_edit_proposal(p_proposal_id) THEN
    RAISE EXCEPTION 'Not authorised to modify this proposal';
  END IF;

  -- Phase 1: park every row on a negative number so no intermediate state can
  -- collide with a number still held by another row.
  WITH ordered AS (
    SELECT id, ROW_NUMBER() OVER (
      ORDER BY participant_number NULLS LAST, created_at, id
    ) AS rn
    FROM public.participants
    WHERE proposal_id = p_proposal_id
  )
  UPDATE public.participants p
  SET participant_number = -ordered.rn
  FROM ordered
  WHERE p.id = ordered.id;

  -- Phase 2: flip to the final positive sequence.
  UPDATE public.participants
  SET participant_number = -participant_number,
      updated_at = now()
  WHERE proposal_id = p_proposal_id
    AND participant_number < 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resequence_participants(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resequence_participants(uuid) TO service_role;