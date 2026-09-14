-- Separate override table for participant information (mirrors ls_budget_permission_overrides)
CREATE TABLE IF NOT EXISTS public.participant_info_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  can_edit boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.participant_info_permission_overrides TO authenticated;
GRANT ALL ON public.participant_info_permission_overrides TO service_role;

ALTER TABLE public.participant_info_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Proposal members can view participant info overrides"
  ON public.participant_info_permission_overrides FOR SELECT TO authenticated
  USING (has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Coordinators can insert participant info overrides"
  ON public.participant_info_permission_overrides FOR INSERT TO authenticated
  WITH CHECK (is_proposal_admin(auth.uid(), proposal_id));

CREATE POLICY "Coordinators can update participant info overrides"
  ON public.participant_info_permission_overrides FOR UPDATE TO authenticated
  USING (is_proposal_admin(auth.uid(), proposal_id))
  WITH CHECK (is_proposal_admin(auth.uid(), proposal_id));

CREATE POLICY "Coordinators can delete participant info overrides"
  ON public.participant_info_permission_overrides FOR DELETE TO authenticated
  USING (is_proposal_admin(auth.uid(), proposal_id));

CREATE TRIGGER participant_info_overrides_updated_at
  BEFORE UPDATE ON public.participant_info_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Sibling of can_edit_participant_budget, resolving against the new table only.
CREATE OR REPLACE FUNCTION public.can_edit_participant_info(_user_id uuid, _participant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _proposal_id uuid;
  _override boolean;
BEGIN
  IF _user_id IS NULL OR _participant_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT p.proposal_id INTO _proposal_id FROM public.participants p WHERE p.id = _participant_id;
  IF _proposal_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_proposal_admin(_user_id, _proposal_id) THEN
    RETURN true;
  END IF;

  IF NOT public.has_any_proposal_role(_user_id, _proposal_id) THEN
    RETURN false;
  END IF;

  SELECT o.can_edit INTO _override
  FROM public.participant_info_permission_overrides o
  WHERE o.participant_id = _participant_id AND o.user_id = _user_id;

  IF _override IS NOT NULL THEN
    RETURN _override;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.participant_members pm
    LEFT JOIN public.profiles pr ON pr.id = _user_id
    WHERE pm.participant_id = _participant_id
      AND (pm.user_id = _user_id
           OR (pm.email IS NOT NULL AND pr.email IS NOT NULL
               AND lower(pm.email) = lower(pr.email)))
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.can_edit_participant_info(uuid, uuid) TO authenticated;

-- Sibling of editable_participant_ids: one call per proposal, participant-info rule.
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

GRANT EXECUTE ON FUNCTION public.info_editable_participant_ids(uuid) TO authenticated;

-- Point the lock/edit gate at the participant-info rule instead of the budget rule.
CREATE OR REPLACE FUNCTION public.participant_info_editable(_participant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _locked boolean;
BEGIN
  IF _participant_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT p.info_locked INTO _locked FROM public.participants p WHERE p.id = _participant_id;
  IF _locked IS NULL OR _locked THEN
    RETURN false;
  END IF;
  RETURN public.can_edit_participant_info(auth.uid(), _participant_id);
END;
$function$;