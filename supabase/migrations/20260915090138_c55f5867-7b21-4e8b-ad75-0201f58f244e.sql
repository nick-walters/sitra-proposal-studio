CREATE OR REPLACE FUNCTION public.participants_lock_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.info_locked THEN
      RAISE EXCEPTION 'Participant information is locked. A coordinator must unlock it first.'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.info_locked IS DISTINCT FROM OLD.info_locked THEN
    IF NOT public.is_proposal_admin(auth.uid(), OLD.proposal_id) THEN
      RAISE EXCEPTION 'Only a coordinator can lock or unlock participant information.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF OLD.info_locked THEN
    -- Locked row: nothing but the lock bookkeeping may change, for anyone,
    -- coordinators included. Unlocking on its own is still allowed, and an
    -- update that tried to unlock and edit in the same statement is refused.
    IF (to_jsonb(NEW) - 'info_locked' - 'info_locked_by' - 'info_locked_at')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'info_locked' - 'info_locked_by' - 'info_locked_at') THEN
      RAISE EXCEPTION 'Participant information is locked. A coordinator must unlock it first.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;