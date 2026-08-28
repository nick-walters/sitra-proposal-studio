-- 1. Fast lookup of module-anchored comments by their target key.
CREATE INDEX IF NOT EXISTS idx_section_comments_module_target
  ON public.section_comments ((anchor_payload->>'targetKey'))
  WHERE anchor_type = 'module';

-- 2. Coordinator-and-above may resolve any comment; authors and proposal
--    admins keep the access they already had.
DROP POLICY IF EXISTS "Users can update their own comments" ON public.section_comments;
CREATE POLICY "Authors, admins and coordinators can update comments"
  ON public.section_comments FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_proposal_admin(auth.uid(), proposal_id)
    OR public.is_coordinator_or_above(auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_proposal_admin(auth.uid(), proposal_id)
    OR public.is_coordinator_or_above(auth.uid())
  );

-- 3. Purging a binned block/module now takes its comments with it.
CREATE OR REPLACE FUNCTION public.purge_deleted_cards()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_field_ids uuid[]; v_card_ids uuid[]; v_generic uuid[]; v_count integer := 0;
  v_keys text[];
BEGIN
  IF NOT (auth.role() = 'service_role' OR public.is_global_admin(auth.uid())) THEN
    RAISE EXCEPTION 'The cards board is restricted to platform owners during beta';
  END IF;

  SELECT array_agg(target_id) INTO v_field_ids FROM public.card_deletions
   WHERE target_type = 'field' AND restored_at IS NULL AND purge_after IS NOT NULL AND purge_after < now();
  SELECT array_agg(target_id) INTO v_card_ids FROM public.card_deletions
   WHERE target_type = 'card' AND restored_at IS NULL AND purge_after IS NOT NULL AND purge_after < now();
  SELECT array_agg(target_id) INTO v_generic FROM public.card_deletions
   WHERE target_type NOT IN ('card','field') AND restored_at IS NULL
     AND purge_after IS NOT NULL AND purge_after < now();

  PERFORM set_config('app.card_bin_ok', '1', true);

  -- Comments anchored to anything about to disappear go with it. Module
  -- comments address a card field as 'card_field:<uuid>' and a block title as
  -- 'card:<uuid>:title'; the generic targets carry their own bare id.
  v_keys := ARRAY[]::text[];
  IF v_field_ids IS NOT NULL THEN
    SELECT v_keys || array_agg('card_field:' || id::text) INTO v_keys
      FROM unnest(v_field_ids) AS id;
  END IF;
  IF v_card_ids IS NOT NULL THEN
    SELECT v_keys || array_agg('card:' || id::text || ':title') INTO v_keys
      FROM unnest(v_card_ids) AS id;
    DELETE FROM public.section_comments c
     USING public.card_fields f
     WHERE c.anchor_type = 'module'
       AND f.card_id = ANY(v_card_ids)
       AND c.anchor_payload->>'targetKey' = 'card_field:' || f.id::text;
  END IF;
  IF array_length(v_keys, 1) IS NOT NULL THEN
    DELETE FROM public.section_comments
     WHERE anchor_type = 'module'
       AND anchor_payload->>'targetKey' = ANY(v_keys);
  END IF;
  IF v_generic IS NOT NULL THEN
    DELETE FROM public.section_comments
     WHERE anchor_type = 'module'
       AND split_part(anchor_payload->>'targetKey', ':', 2) = ANY(
             SELECT id::text FROM unnest(v_generic) AS id);
  END IF;

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
  IF v_generic IS NOT NULL THEN
    DELETE FROM public.card_field_versions
     WHERE target_type <> 'card_field' AND target_id = ANY(v_generic);
  END IF;

  WITH d AS (
    DELETE FROM public.card_deletions
     WHERE restored_at IS NULL AND purge_after IS NOT NULL AND purge_after < now()
    RETURNING 1
  ) SELECT count(*) INTO v_count FROM d;

  WITH f AS (
    DELETE FROM public.figures fg
     WHERE fg.deleted_at IS NOT NULL
       AND fg.purge_after IS NOT NULL
       AND fg.purge_after < now()
       AND NOT EXISTS (SELECT 1 FROM public.card_figure cf WHERE cf.figure_id = fg.id)
    RETURNING 1
  ) SELECT v_count + count(*) INTO v_count FROM f;

  PERFORM set_config('app.card_bin_ok', '0', true);
  RETURN v_count;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.purge_deleted_cards() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_deleted_cards() TO authenticated, service_role;