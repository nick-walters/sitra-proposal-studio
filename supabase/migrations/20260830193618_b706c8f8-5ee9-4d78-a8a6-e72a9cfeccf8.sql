DROP POLICY IF EXISTS "Users collapse blocks for themselves" ON public.card_collapse_states;

CREATE POLICY "Users collapse blocks for themselves"
ON public.card_collapse_states
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.proposal_cards pc
    WHERE pc.id = card_collapse_states.card_id
      AND public.has_any_proposal_role(auth.uid(), pc.proposal_id)
  )
);

CREATE OR REPLACE FUNCTION public.heartbeat_card_lock(p_target_type text, p_target_id text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_hit integer;
BEGIN
  DELETE FROM public.card_target_locks WHERE expires_at < now();
  UPDATE public.card_target_locks AS l
     SET last_heartbeat_at = now(), expires_at = now() + interval '300 seconds'
   WHERE l.target_type = p_target_type
     AND l.target_id = p_target_id
     AND l.user_id = v_uid
     AND public.can_edit_proposal(v_uid, l.proposal_id);
  GET DIAGNOSTICS v_hit = ROW_COUNT;
  RETURN v_hit > 0;
END;
$function$;