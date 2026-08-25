CREATE TABLE public.proposal_row_bin (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  table_name text NOT NULL CHECK (table_name IN ('proposal_milestones','proposal_risks')),
  row_id uuid NOT NULL,
  label text,
  payload jsonb NOT NULL,
  links jsonb NOT NULL DEFAULT '[]'::jsonb,
  deleted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_row_bin TO authenticated;
GRANT ALL ON public.proposal_row_bin TO service_role;

ALTER TABLE public.proposal_row_bin ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Editors can view the bin"
  ON public.proposal_row_bin FOR SELECT TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Editors can empty the bin"
  ON public.proposal_row_bin FOR DELETE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE INDEX proposal_row_bin_lookup_idx
  ON public.proposal_row_bin (proposal_id, table_name, created_at DESC);

CREATE TRIGGER update_proposal_row_bin_updated_at
  BEFORE UPDATE ON public.proposal_row_bin
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Deleting a milestone or risk files a full copy (row + WP links) in the bin
-- before the existing guarded delete runs, so it can be restored intact.
CREATE OR REPLACE FUNCTION public.bin_and_delete_numbered_row(
  p_table text,
  p_id uuid,
  p_expected_version integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pid uuid;
  v_payload jsonb;
  v_links jsonb;
  v_label text;
  v_result jsonb;
BEGIN
  IF p_table NOT IN ('proposal_milestones','proposal_risks') THEN
    RAISE EXCEPTION 'Table % cannot be binned', p_table;
  END IF;

  IF p_table = 'proposal_milestones' THEN
    SELECT to_jsonb(m), m.proposal_id, m.title
      INTO v_payload, v_pid, v_label
      FROM public.proposal_milestones m WHERE m.id = p_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('wp_draft_id', w.wp_draft_id, 'is_primary', w.is_primary)), '[]'::jsonb)
      INTO v_links FROM public.proposal_milestone_wps w WHERE w.milestone_id = p_id;
  ELSE
    SELECT to_jsonb(r), r.proposal_id, r.title
      INTO v_payload, v_pid, v_label
      FROM public.proposal_risks r WHERE r.id = p_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object('wp_draft_id', w.wp_draft_id)), '[]'::jsonb)
      INTO v_links FROM public.proposal_risk_wps w WHERE w.risk_id = p_id;
  END IF;

  IF v_pid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'error', 'not_found');
  END IF;

  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), v_pid) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_result := public.delete_and_resequence(p_table, p_id, p_expected_version);

  IF coalesce((v_result->>'ok')::boolean, false) THEN
    INSERT INTO public.proposal_row_bin (proposal_id, table_name, row_id, label, payload, links, deleted_by)
    VALUES (v_pid, p_table, p_id, v_label, v_payload, v_links, auth.uid());
  END IF;

  RETURN v_result;
END;
$$;

-- Puts a binned milestone or risk back, with its WP links. Milestone numbering
-- is recalculated by the existing resequencing triggers on insert.
CREATE OR REPLACE FUNCTION public.restore_binned_row(p_bin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bin public.proposal_row_bin;
  v_link jsonb;
BEGIN
  SELECT * INTO v_bin FROM public.proposal_row_bin WHERE id = p_bin_id;
  IF v_bin.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), v_bin.proposal_id) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF v_bin.table_name = 'proposal_milestones' THEN
    INSERT INTO public.proposal_milestones
      (id, proposal_id, number, title, due_month, means_of_verification, order_index)
    SELECT (v_bin.payload->>'id')::uuid, v_bin.proposal_id,
           coalesce((v_bin.payload->>'number')::integer, 1),
           v_bin.payload->>'title',
           (v_bin.payload->>'due_month')::integer,
           v_bin.payload->>'means_of_verification',
           coalesce((v_bin.payload->>'order_index')::integer, 0);

    FOR v_link IN SELECT * FROM jsonb_array_elements(v_bin.links) LOOP
      INSERT INTO public.proposal_milestone_wps (milestone_id, wp_draft_id, is_primary)
      VALUES ((v_bin.payload->>'id')::uuid, (v_link->>'wp_draft_id')::uuid,
              coalesce((v_link->>'is_primary')::boolean, false));
    END LOOP;

    PERFORM public.resequence_numbered('proposal_milestones', v_bin.proposal_id);
  ELSE
    INSERT INTO public.proposal_risks
      (id, proposal_id, number, title, likelihood, severity, mitigation, order_index)
    SELECT (v_bin.payload->>'id')::uuid, v_bin.proposal_id,
           (v_bin.payload->>'number')::integer,
           v_bin.payload->>'title',
           v_bin.payload->>'likelihood',
           v_bin.payload->>'severity',
           v_bin.payload->>'mitigation',
           coalesce((v_bin.payload->>'order_index')::integer, 0);

    FOR v_link IN SELECT * FROM jsonb_array_elements(v_bin.links) LOOP
      INSERT INTO public.proposal_risk_wps (risk_id, wp_draft_id)
      VALUES ((v_bin.payload->>'id')::uuid, (v_link->>'wp_draft_id')::uuid);
    END LOOP;
  END IF;

  DELETE FROM public.proposal_row_bin WHERE id = p_bin_id;

  RETURN jsonb_build_object('ok', true, 'row_id', v_bin.row_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bin_and_delete_numbered_row(text, uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_binned_row(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bin_and_delete_numbered_row(text, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_binned_row(uuid) TO authenticated;