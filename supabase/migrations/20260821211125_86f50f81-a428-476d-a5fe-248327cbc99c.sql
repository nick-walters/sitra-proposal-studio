-- 1. Soft-delete columns on figures, mirroring the block bin.
ALTER TABLE public.figures
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL,
  ADD COLUMN IF NOT EXISTS purge_after timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_figures_deleted ON public.figures (proposal_id, deleted_at);

-- 2. No hard DELETE for end users: purging is the scheduled job's business.
REVOKE DELETE ON public.figures FROM anon, authenticated;

-- 3. Soft delete. Refuses any figure held by a block, live or soft-deleted.
CREATE OR REPLACE FUNCTION public.soft_delete_figure(p_figure_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_proposal uuid;
  v_card record;
  v_label text;
  v_post boolean;
BEGIN
  SELECT proposal_id INTO v_proposal FROM public.figures WHERE id = p_figure_id AND deleted_at IS NULL;
  IF v_proposal IS NULL THEN
    RAISE EXCEPTION 'Figure not found';
  END IF;
  IF NOT public.can_edit_proposal(auth.uid(), v_proposal) THEN
    RAISE EXCEPTION 'You do not have permission to delete figures in this proposal';
  END IF;

  SELECT c.id, c.deleted_at, s.section_number
    INTO v_card
    FROM public.card_figure cf
    JOIN public.proposal_cards c ON c.id = cf.card_id
    LEFT JOIN public.proposal_template_sections s ON s.id = c.section_id
   WHERE cf.figure_id = p_figure_id
   LIMIT 1;

  IF FOUND THEN
    v_label := COALESCE(v_card.section_number, 'another section');
    IF v_card.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'This figure belongs to a deleted block in section %. Restore or purge that block first.', v_label;
    ELSE
      RAISE EXCEPTION 'This figure is used in section %. Remove it from its block first.', v_label;
    END IF;
  END IF;

  SELECT status IN ('submitted','funded','not_funded') INTO v_post FROM public.proposals WHERE id = v_proposal;

  UPDATE public.figures
     SET deleted_at = now(),
         deleted_by = auth.uid(),
         purge_after = CASE WHEN v_post THEN now() + interval '30 days' ELSE NULL END
   WHERE id = p_figure_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.soft_delete_figure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.soft_delete_figure(uuid) TO authenticated;

-- 4. Restore returns the figure to Unplaced.
CREATE OR REPLACE FUNCTION public.restore_figure(p_figure_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_proposal uuid;
BEGIN
  SELECT proposal_id INTO v_proposal FROM public.figures WHERE id = p_figure_id AND deleted_at IS NOT NULL;
  IF v_proposal IS NULL THEN
    RAISE EXCEPTION 'Figure not found in the recycle bin';
  END IF;
  IF NOT public.can_edit_proposal(auth.uid(), v_proposal) THEN
    RAISE EXCEPTION 'You do not have permission to restore figures in this proposal';
  END IF;

  UPDATE public.figures
     SET deleted_at = NULL, deleted_by = NULL, purge_after = NULL
   WHERE id = p_figure_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.restore_figure(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.restore_figure(uuid) TO authenticated;

-- 5. Same retention rule as the block bin: nothing expires before submission,
--    then 30 days; un-submitting clears the countdown again.
CREATE OR REPLACE FUNCTION public.set_card_bin_retention_on_submit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old_post boolean;
  v_new_post boolean;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_old_post := OLD.status IN ('submitted','funded','not_funded');
    v_new_post := NEW.status IN ('submitted','funded','not_funded');

    IF v_new_post AND NOT v_old_post THEN
      UPDATE public.card_deletions
         SET purge_after = now() + interval '30 days'
       WHERE proposal_id = NEW.id
         AND restored_at IS NULL
         AND purge_after IS NULL;
      UPDATE public.figures
         SET purge_after = now() + interval '30 days'
       WHERE proposal_id = NEW.id
         AND deleted_at IS NOT NULL
         AND purge_after IS NULL;
    ELSIF v_old_post AND NOT v_new_post THEN
      UPDATE public.card_deletions
         SET purge_after = NULL
       WHERE proposal_id = NEW.id AND restored_at IS NULL;
      UPDATE public.figures
         SET purge_after = NULL
       WHERE proposal_id = NEW.id AND deleted_at IS NOT NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- 6. The existing purge job also clears expired figures.
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
  -- scheduled purge job (service_role) or platform owners/admins only.
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

  -- Expired soft-deleted figures. Only ones no block still references.
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

REVOKE ALL ON FUNCTION public.purge_deleted_cards() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_deleted_cards() TO service_role;