CREATE OR REPLACE FUNCTION public.editable_participant_ids(_proposal_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _email text;
BEGIN
  IF _user_id IS NULL OR _proposal_id IS NULL THEN
    RETURN;
  END IF;

  -- Admin/coordinator: every participant on the proposal.
  IF public.is_proposal_admin(_user_id, _proposal_id) THEN
    RETURN QUERY SELECT p.id FROM public.participants p WHERE p.proposal_id = _proposal_id;
    RETURN;
  END IF;

  -- No role on this proposal at all: nothing editable.
  IF NOT public.has_any_proposal_role(_user_id, _proposal_id) THEN
    RETURN;
  END IF;

  SELECT lower(u.email) INTO _email FROM auth.users u WHERE u.id = _user_id;

  RETURN QUERY
  SELECT p.id
  FROM public.participants p
  LEFT JOIN public.ls_budget_permission_overrides o
    ON o.participant_id = p.id AND o.user_id = _user_id
  WHERE p.proposal_id = _proposal_id
    AND CASE
      WHEN o.participant_id IS NOT NULL THEN o.can_edit
      ELSE EXISTS (
        SELECT 1 FROM public.participant_members pm
        WHERE pm.participant_id = p.id
          AND (pm.user_id = _user_id OR lower(pm.email) = _email)
      )
    END;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.editable_participant_ids(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.editable_participant_ids(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.editable_participant_ids(uuid, uuid) TO authenticated;