ALTER TABLE public.proposal_row_bin ADD COLUMN IF NOT EXISTS purge_after timestamptz;

CREATE OR REPLACE FUNCTION public.set_row_bin_purge_after()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.purge_after IS NULL THEN
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

DROP TRIGGER IF EXISTS trg_row_bin_purge_after ON public.proposal_row_bin;
CREATE TRIGGER trg_row_bin_purge_after
BEFORE INSERT ON public.proposal_row_bin
FOR EACH ROW EXECUTE FUNCTION public.set_row_bin_purge_after();

CREATE OR REPLACE FUNCTION public.set_card_bin_retention_on_submit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
       WHERE proposal_id = NEW.id AND restored_at IS NULL AND purge_after IS NULL;
      UPDATE public.figures
         SET purge_after = now() + interval '90 days'
       WHERE proposal_id = NEW.id AND deleted_at IS NOT NULL AND purge_after IS NULL;
      UPDATE public.proposal_row_bin
         SET purge_after = now() + interval '90 days'
       WHERE proposal_id = NEW.id AND purge_after IS NULL;
    ELSIF v_old_post AND NOT v_new_post THEN
      UPDATE public.card_deletions
         SET purge_after = NULL
       WHERE proposal_id = NEW.id AND restored_at IS NULL;
      UPDATE public.figures
         SET purge_after = NULL
       WHERE proposal_id = NEW.id AND deleted_at IS NOT NULL;
      UPDATE public.proposal_row_bin
         SET purge_after = NULL
       WHERE proposal_id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;