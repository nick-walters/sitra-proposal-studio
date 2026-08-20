-- 1. resequence_section_cards: add the standard TEMPORARY beta guard.
CREATE OR REPLACE FUNCTION public.resequence_section_cards(p_section_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_park integer;
BEGIN
  -- TEMPORARY DEVELOPMENT RESTRICTION (beta cards board, added 2026-08-18):
  -- platform owners/admins only (public.is_global_admin). MUST be relaxed to
  -- public.can_edit_proposal() at cutover, before the cards feature ships.
  IF NOT public.is_global_admin(auth.uid()) THEN
    RAISE EXCEPTION 'The cards board is restricted to platform owners during beta';
  END IF;

  SET CONSTRAINTS ALL DEFERRED;

  SELECT COALESCE(max(order_index), 9999) INTO v_park
    FROM public.proposal_cards
   WHERE section_id = p_section_id AND deleted_at IS NOT NULL AND order_index >= 10000;

  UPDATE public.proposal_cards c
     SET order_index = 10000 + s.rn + GREATEST(v_park - 9999, 0)
    FROM (
      SELECT id, row_number() OVER (ORDER BY order_index, created_at) AS rn
        FROM public.proposal_cards
       WHERE section_id = p_section_id AND deleted_at IS NOT NULL
         AND anchor = 'free' AND order_index < 10000
    ) s
   WHERE c.id = s.id;

  UPDATE public.proposal_cards c
     SET order_index = s.new_idx
    FROM (
      SELECT id, 99 + (row_number() OVER (ORDER BY order_index, created_at))::int AS new_idx
        FROM public.proposal_cards
       WHERE section_id = p_section_id AND anchor = 'free' AND deleted_at IS NULL
    ) s
   WHERE c.id = s.id AND c.order_index IS DISTINCT FROM s.new_idx;
END;
$function$;

-- 2. normalise_section_card_order: same guard (belt and braces; it delegates).
CREATE OR REPLACE FUNCTION public.normalise_section_card_order(p_section_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- TEMPORARY DEVELOPMENT RESTRICTION (beta cards board, added 2026-08-18):
  -- platform owners/admins only (public.is_global_admin). MUST be relaxed to
  -- public.can_edit_proposal() at cutover, before the cards feature ships.
  IF NOT public.is_global_admin(auth.uid()) THEN
    RAISE EXCEPTION 'The cards board is restricted to platform owners during beta';
  END IF;

  PERFORM public.resequence_section_cards(p_section_id);
END;
$function$;

-- 3. purge_deleted_cards: scheduled job only (service_role), plus platform owners.
CREATE OR REPLACE FUNCTION public.purge_deleted_cards()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_field_ids uuid[];
  v_card_ids uuid[];
  v_count integer := 0;
BEGIN
  -- TEMPORARY DEVELOPMENT RESTRICTION (beta cards board, added 2026-08-18):
  -- scheduled purge job (service_role) or platform owners/admins only
  -- (public.is_global_admin). At cutover this should stay service_role-only.
  IF NOT (auth.role() = 'service_role' OR public.is_global_admin(auth.uid())) THEN
    RAISE EXCEPTION 'The cards board is restricted to platform owners during beta';
  END IF;

  SELECT array_agg(target_id) INTO v_field_ids FROM public.card_deletions
   WHERE target_type = 'field' AND restored_at IS NULL AND purge_after IS NOT NULL AND purge_after < now();
  SELECT array_agg(target_id) INTO v_card_ids FROM public.card_deletions
   WHERE target_type = 'card' AND restored_at IS NULL AND purge_after IS NOT NULL AND purge_after < now();

  PERFORM set_config('app.card_bin_ok', '1', true);

  IF v_card_ids IS NOT NULL THEN
    DELETE FROM public.card_field_versions v
     USING public.card_fields f
     WHERE v.field_id = f.id AND f.card_id = ANY(v_card_ids);
  END IF;
  IF v_field_ids IS NOT NULL THEN
    DELETE FROM public.card_field_versions WHERE field_id = ANY(v_field_ids);
    DELETE FROM public.card_fields WHERE id = ANY(v_field_ids) AND deleted_at IS NOT NULL;
  END IF;
  IF v_card_ids IS NOT NULL THEN
    DELETE FROM public.card_fields WHERE card_id = ANY(v_card_ids);
    DELETE FROM public.proposal_cards WHERE id = ANY(v_card_ids) AND deleted_at IS NOT NULL;
  END IF;

  WITH d AS (
    DELETE FROM public.card_deletions
     WHERE restored_at IS NULL AND purge_after IS NOT NULL AND purge_after < now()
    RETURNING 1
  ) SELECT count(*) INTO v_count FROM d;

  PERFORM set_config('app.card_bin_ok', '0', true);
  RETURN v_count;
END;
$function$;

-- 4. thin_card_field_versions: keep the can_edit_proposal check, add the beta guard.
CREATE OR REPLACE FUNCTION public.thin_card_field_versions(p_proposal_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  deleted_count integer := 0;
  r record;
BEGIN
  -- TEMPORARY DEVELOPMENT RESTRICTION (beta cards board, added 2026-08-18):
  -- platform owners/admins only (public.is_global_admin). MUST be relaxed to
  -- public.can_edit_proposal() at cutover, before the cards feature ships.
  IF NOT public.is_global_admin(auth.uid()) THEN
    RAISE EXCEPTION 'The cards board is restricted to platform owners during beta';
  END IF;

  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: caller cannot edit this proposal';
  END IF;

  PERFORM set_config('app.card_bin_ok', '1', true);

  FOR r IN
    WITH latest_per_box AS (
      SELECT DISTINCT ON (field_id, text_box) id
      FROM card_field_versions
      WHERE proposal_id = p_proposal_id
      ORDER BY field_id, text_box, version_number DESC
    ),
    candidates AS (
      SELECT cv.id,
        ROW_NUMBER() OVER (
          PARTITION BY cv.field_id, cv.text_box,
            CASE
              WHEN cv.created_at > now() - interval '7 days' THEN 'keep_all'
              WHEN cv.created_at > now() - interval '30 days' THEN date_trunc('hour', cv.created_at)::text
              WHEN cv.created_at > now() - interval '90 days' THEN date_trunc('day', cv.created_at)::text
              ELSE date_trunc('week', cv.created_at)::text
            END
          ORDER BY cv.created_at DESC
        ) AS rn,
        CASE WHEN cv.created_at > now() - interval '7 days' THEN 'keep_all' ELSE 'thin' END AS age_bucket
      FROM card_field_versions cv
      WHERE cv.proposal_id = p_proposal_id
        AND cv.is_auto_save = true
        AND cv.version_number > 1
        AND cv.id NOT IN (SELECT id FROM latest_per_box)
    )
    SELECT id FROM candidates
    WHERE age_bucket = 'thin' AND rn > 1
  LOOP
    DELETE FROM card_field_versions WHERE id = r.id AND proposal_id = p_proposal_id;
    deleted_count := deleted_count + 1;
  END LOOP;

  PERFORM set_config('app.card_bin_ok', '0', true);

  RETURN deleted_count;
END;
$function$;

-- Tighten EXECUTE privileges: purge is a job, not a user action.
REVOKE ALL ON FUNCTION public.purge_deleted_cards() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_deleted_cards() TO service_role;

REVOKE ALL ON FUNCTION public.resequence_section_cards(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.normalise_section_card_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resequence_section_cards(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalise_section_card_order(uuid) TO authenticated, service_role;