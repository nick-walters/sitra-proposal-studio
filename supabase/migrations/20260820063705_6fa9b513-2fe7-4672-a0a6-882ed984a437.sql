CREATE OR REPLACE FUNCTION public.save_milestone_and_resequence(
  p_id uuid,
  p_patch jsonb,
  p_expected_version integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res jsonb;
  v_pid uuid;
  v_row jsonb;
BEGIN
  v_res := public.save_versioned_row('proposal_milestones', p_id, p_patch, p_expected_version);
  IF NOT COALESCE((v_res ->> 'ok')::boolean, false) THEN
    RETURN v_res;
  END IF;

  SELECT proposal_id INTO v_pid FROM public.proposal_milestones WHERE id = p_id;
  PERFORM public.resequence_numbered('proposal_milestones', v_pid);

  SELECT to_jsonb(m.*), m.version INTO v_row, p_expected_version
    FROM public.proposal_milestones m WHERE m.id = p_id;

  RETURN jsonb_build_object('ok', true, 'conflict', false,
                            'version', p_expected_version, 'row', v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.save_milestone_and_resequence(uuid, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_milestone_and_resequence(uuid, jsonb, integer) TO authenticated, service_role;