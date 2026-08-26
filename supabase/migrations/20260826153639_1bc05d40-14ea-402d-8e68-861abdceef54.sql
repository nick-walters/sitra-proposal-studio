-- 1. Fixed-position blocks may now be deleted (deletion is soft and reversible);
--    they must still be anchored to the head or tail band while present.
CREATE OR REPLACE FUNCTION public.validate_proposal_card()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_max_head integer;
  v_min_tail integer;
  v_admin boolean := COALESCE(current_setting('app.card_admin_ok', true), '') = '1';
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.document IS DISTINCT FROM OLD.document THEN
      RAISE EXCEPTION 'proposal_cards.document is immutable';
    END IF;
    IF NOT v_admin AND NEW.kind IS DISTINCT FROM OLD.kind THEN
      RAISE EXCEPTION 'proposal_cards.kind is immutable';
    END IF;
    IF NOT v_admin AND NEW.anchor IS DISTINCT FROM OLD.anchor THEN
      RAISE EXCEPTION 'proposal_cards.anchor cannot be changed';
    END IF;
    IF NOT v_admin AND OLD.anchor IN ('head','tail') AND NEW.order_index IS DISTINCT FROM OLD.order_index
       AND NEW.deleted_at IS NULL AND OLD.deleted_at IS NULL THEN
      RAISE EXCEPTION 'Cards in the % band cannot be reordered', OLD.anchor;
    END IF;
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       AND COALESCE(current_setting('app.card_bin_ok', true), '') <> '1' THEN
      RAISE EXCEPTION 'deleted_at may only be changed by the card recycle-bin functions';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.deleted_at IS NOT NULL AND COALESCE(current_setting('app.card_bin_ok', true), '') <> '1' THEN
      RAISE EXCEPTION 'deleted_at may only be set by the card recycle-bin functions';
    END IF;
  END IF;

  IF NEW.is_fixed_position AND NEW.anchor = 'free' THEN
    RAISE EXCEPTION 'Fixed-position cards must be anchored to head or tail';
  END IF;

  IF NEW.deleted_at IS NULL THEN
    IF NEW.anchor = 'head' AND (NEW.order_index < 0 OR NEW.order_index > 99) THEN
      RAISE EXCEPTION 'Head-band cards require order_index 0-99 (got %)', NEW.order_index;
    ELSIF NEW.anchor = 'free' AND (NEW.order_index < 100 OR NEW.order_index > 999) THEN
      RAISE EXCEPTION 'Free-band cards require order_index 100-999 (got %)', NEW.order_index;
    ELSIF NEW.anchor = 'tail' AND NEW.order_index < 1000 THEN
      RAISE EXCEPTION 'Tail-band cards require order_index >= 1000 (got %)', NEW.order_index;
    END IF;

    IF NEW.anchor = 'free' THEN
      SELECT max(order_index) INTO v_max_head FROM public.proposal_cards
        WHERE section_id = NEW.section_id AND anchor = 'head' AND deleted_at IS NULL;
      SELECT min(order_index) INTO v_min_tail FROM public.proposal_cards
        WHERE section_id = NEW.section_id AND anchor = 'tail' AND deleted_at IS NULL;
      IF v_max_head IS NOT NULL AND NEW.order_index <= v_max_head THEN
        RAISE EXCEPTION 'A free card cannot be placed above the head band';
      END IF;
      IF v_min_tail IS NOT NULL AND NEW.order_index >= v_min_tail THEN
        RAISE EXCEPTION 'A free card cannot be placed within or below the tail band';
      END IF;
    END IF;
  ELSIF NEW.order_index < 10000 AND NEW.anchor = 'free' THEN
    NULL;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. 90-day bin retention after submission (was 30 days).
CREATE OR REPLACE FUNCTION public.set_card_deletion_purge_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.purge_after IS NULL AND NEW.restored_at IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.proposals p
       WHERE p.id = NEW.proposal_id
         AND p.status IN ('submitted','funded','not_funded')
    ) THEN
      NEW.purge_after := now() + interval '90 days';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

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
         SET purge_after = now() + interval '90 days'
       WHERE proposal_id = NEW.id
         AND restored_at IS NULL
         AND purge_after IS NULL;
      UPDATE public.figures
         SET purge_after = now() + interval '90 days'
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

UPDATE public.card_deletions
   SET purge_after = purge_after + interval '60 days'
 WHERE restored_at IS NULL AND purge_after IS NOT NULL;

-- 3. Every block becomes deletable, in templates and live proposals alike.
UPDATE public.card_templates SET is_deletable = true WHERE is_deletable = false;
UPDATE public.proposal_cards SET is_deletable = true WHERE is_deletable = false AND deleted_at IS NULL;