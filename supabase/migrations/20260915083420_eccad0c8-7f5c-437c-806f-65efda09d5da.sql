CREATE OR REPLACE FUNCTION public.participant_info_editable(_participant_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _locked boolean;
  _proposal_id uuid;
BEGIN
  IF _participant_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.info_locked, p.proposal_id INTO _locked, _proposal_id
  FROM public.participants p WHERE p.id = _participant_id;

  IF _locked IS NULL OR _locked THEN
    RETURN false;
  END IF;

  RETURN public.can_edit_participant_info(auth.uid(), _participant_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.info_editable_participant_ids(_proposal_id uuid)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _user_id uuid := auth.uid();
BEGIN
  IF _user_id IS NULL OR _proposal_id IS NULL THEN
    RETURN;
  END IF;

  IF public.is_proposal_admin(_user_id, _proposal_id) THEN
    RETURN QUERY SELECT p.id FROM public.participants p WHERE p.proposal_id = _proposal_id;
    RETURN;
  END IF;

  IF NOT public.has_any_proposal_role(_user_id, _proposal_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id
  FROM public.participants p
  LEFT JOIN public.participant_info_permission_overrides o
    ON o.participant_id = p.id AND o.user_id = _user_id
  LEFT JOIN public.profiles pr ON pr.id = _user_id
  WHERE p.proposal_id = _proposal_id
    AND COALESCE(
      o.can_edit,
      EXISTS (
        SELECT 1 FROM public.participant_members pm
        WHERE pm.participant_id = p.id
          AND (pm.user_id = _user_id
               OR (pm.email IS NOT NULL AND pr.email IS NOT NULL
                   AND lower(pm.email) = lower(pr.email)))
      )
    );
END;
$function$;