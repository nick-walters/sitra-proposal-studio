CREATE OR REPLACE FUNCTION public.delete_proposal(_proposal_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_exists boolean;
BEGIN
  IF _proposal_id IS NULL THEN
    RAISE EXCEPTION 'Proposal id is required';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.proposals WHERE id = _proposal_id) INTO v_exists;
  IF NOT v_exists THEN
    RAISE EXCEPTION 'Proposal not found';
  END IF;

  -- Authorisation: global owner/admin, or proposal-scoped owner/admin.
  -- Deliberately excludes proposal coordinators.
  IF NOT (
    public.is_global_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.proposal_id = _proposal_id
        AND ur.role IN ('owner'::app_role, 'admin'::app_role)
    )
  ) THEN
    RAISE EXCEPTION 'Only a proposal owner or admin may delete a proposal';
  END IF;

  -- Allow the history guard triggers to permit this one cascade
  PERFORM set_config('app.card_bin_ok', '1', true);
  PERFORM set_config('app.allow_thinning', 'true', true);

  -- RESTRICT: card_field_versions.field_id -> card_fields(id)
  DELETE FROM public.card_field_versions
  WHERE proposal_id = _proposal_id
     OR field_id IN (SELECT id FROM public.card_fields WHERE proposal_id = _proposal_id);

  -- RESTRICT: case_drafts.case_type_id -> proposal_case_types(id)
  DELETE FROM public.case_drafts WHERE proposal_id = _proposal_id;

  -- notifications deliberately has no foreign key to proposals (it stores a
  -- bare proposal_id for deep links), so its rows must be removed explicitly
  -- or they survive as links to nothing.
  DELETE FROM public.notifications WHERE proposal_id = _proposal_id;

  DELETE FROM public.proposals WHERE id = _proposal_id;
END;
$function$;