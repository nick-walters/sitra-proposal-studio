-- 1. Case drafts are proposal content: allow anyone who can edit the proposal to update them.
DROP POLICY IF EXISTS "Admins/owners can update case drafts" ON public.case_drafts;
CREATE POLICY "Case drafts updatable by editors"
ON public.case_drafts FOR UPDATE TO authenticated
USING (public.can_edit_proposal(auth.uid(), proposal_id));

-- 2. Deleting a work package is structural: require coordinator-or-above inside the RPC.
CREATE OR REPLACE FUNCTION public.delete_and_resequence(p_table text, p_id uuid, p_expected_version integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_parent text := public.numbered_parent_column(p_table);
  v_pid uuid;
  v_cur integer;
  v_parent_id uuid;
  v_remaining integer;
BEGIN
  IF v_parent IS NULL OR NOT public.versioned_table_allowed(p_table) THEN
    RAISE EXCEPTION 'Table % is not a guarded numbered list', p_table;
  END IF;

  v_pid := public.versioned_row_proposal(p_table, p_id);
  IF v_pid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'error', 'not_found');
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Deleting a whole work package cascades to its tasks and deliverables, so it
  -- matches the wp_drafts RLS DELETE policy (admins/coordinators only).
  IF p_table = 'wp_drafts' THEN
    IF NOT public.is_proposal_admin(auth.uid(), v_pid) THEN
      RAISE EXCEPTION 'Permission denied: deleting a work package requires coordinator access';
    END IF;
  ELSIF NOT public.can_edit_proposal(auth.uid(), v_pid) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  EXECUTE format('SELECT version, %I FROM %I WHERE id = $1', v_parent, p_table)
    INTO v_cur, v_parent_id USING p_id;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_cur THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'version', v_cur);
  END IF;

  EXECUTE format('DELETE FROM %I WHERE id = $1', p_table) USING p_id;

  IF p_table = 'proposal_risks' THEN
    SELECT count(*) INTO v_remaining FROM public.proposal_risks WHERE proposal_id = v_parent_id;
  ELSE
    v_remaining := public.resequence_numbered(p_table, v_parent_id);
  END IF;

  RETURN jsonb_build_object('ok', true, 'conflict', false, 'remaining', v_remaining);
END;
$function$;

-- 3. No card RPC is usable signed out; revoke anon EXECUTE.
REVOKE EXECUTE ON FUNCTION public.acquire_card_lock(uuid, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.heartbeat_card_lock(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.release_card_lock(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_card_field(uuid, text, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_manual_text_card(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reorder_card_fields(uuid, uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reorder_section_cards(uuid, uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_card(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.restore_card_field(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_card_field_version(uuid, text, text, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_card_text(uuid, text, text, integer, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_card_title(uuid, text, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.seed_proposal_cards(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_card(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.soft_delete_card_field(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.thin_card_field_versions(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_card_bin_retention_on_submit() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_card_deletion_purge_after() FROM anon, authenticated;