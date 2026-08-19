
CREATE OR REPLACE FUNCTION public.acquire_card_lock(p_proposal_id uuid, p_target_type text, p_target_id text, p_section_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_avatar text;
  v_row public.card_target_locks;
BEGIN
  -- TEMPORARY DEVELOPMENT RESTRICTION (beta cards board, added 2026-08-18):
  -- platform owners/admins only (public.is_global_admin). MUST be relaxed to
  -- public.can_edit_proposal() at cutover, before the cards feature ships.
  IF NOT public.is_global_admin(auth.uid()) THEN
    RAISE EXCEPTION 'The cards board is restricted to platform owners during beta';
  END IF;

  IF v_uid IS NULL OR NOT public.can_edit_proposal(v_uid, p_proposal_id) THEN
    RAISE EXCEPTION 'Not allowed to edit this proposal';
  END IF;

  DELETE FROM public.card_target_locks WHERE expires_at < now();

  SELECT COALESCE(NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''), full_name, email),
         avatar_url
    INTO v_name, v_avatar
  FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.card_target_locks AS l
    (proposal_id, section_id, target_type, target_id, user_id, user_name, avatar_url, expires_at)
  VALUES (p_proposal_id, p_section_id, p_target_type, p_target_id, v_uid, v_name, v_avatar, now() + interval '300 seconds')
  ON CONFLICT (target_type, target_id) DO UPDATE
    SET last_heartbeat_at = now(),
        expires_at = now() + interval '300 seconds',
        user_name = EXCLUDED.user_name,
        avatar_url = EXCLUDED.avatar_url
    WHERE l.user_id = v_uid
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.card_target_locks
     WHERE target_type = p_target_type AND target_id = p_target_id;
  END IF;

  RETURN jsonb_build_object(
    'acquired', v_row.user_id = v_uid,
    'user_id', v_row.user_id,
    'user_name', v_row.user_name,
    'avatar_url', v_row.avatar_url,
    'expires_at', v_row.expires_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.heartbeat_card_lock(p_target_type text, p_target_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_hit integer;
BEGIN
  -- TEMPORARY DEVELOPMENT RESTRICTION (beta cards board, added 2026-08-18):
  -- platform owners/admins only (public.is_global_admin). MUST be relaxed to
  -- public.can_edit_proposal() at cutover, before the cards feature ships.
  IF NOT public.is_global_admin(auth.uid()) THEN
    RAISE EXCEPTION 'The cards board is restricted to platform owners during beta';
  END IF;

  DELETE FROM public.card_target_locks WHERE expires_at < now();
  UPDATE public.card_target_locks
     SET last_heartbeat_at = now(), expires_at = now() + interval '300 seconds'
   WHERE target_type = p_target_type AND target_id = p_target_id AND user_id = v_uid;
  GET DIAGNOSTICS v_hit = ROW_COUNT;
  RETURN v_hit > 0;
END;
$function$;

ALTER TABLE public.card_target_locks ALTER COLUMN expires_at SET DEFAULT (now() + interval '300 seconds');

ALTER TABLE public.proposal_cards REPLICA IDENTITY FULL;
ALTER TABLE public.card_fields REPLICA IDENTITY FULL;
ALTER TABLE public.card_deletions REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.proposal_cards;
ALTER PUBLICATION supabase_realtime ADD TABLE public.card_fields;
ALTER PUBLICATION supabase_realtime ADD TABLE public.card_deletions;
