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
    ELSIF v_old_post AND NOT v_new_post THEN
      UPDATE public.card_deletions
         SET purge_after = NULL
       WHERE proposal_id = NEW.id AND restored_at IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

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
      NEW.purge_after := now() + interval '30 days';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_card_deletions_purge_after ON public.card_deletions;
CREATE TRIGGER trg_card_deletions_purge_after
BEFORE INSERT ON public.card_deletions
FOR EACH ROW EXECUTE FUNCTION public.set_card_deletion_purge_after();