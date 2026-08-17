-- ============ 1. LOCK TABLE ============
CREATE TABLE IF NOT EXISTS public.card_target_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  section_id uuid,
  target_type text NOT NULL CHECK (target_type IN ('text_box','table_cell','figure')),
  target_id text NOT NULL,
  user_id uuid NOT NULL,
  user_name text,
  avatar_url text,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '45 seconds',
  CONSTRAINT card_target_locks_target_key UNIQUE (target_type, target_id)
);

CREATE INDEX IF NOT EXISTS card_target_locks_proposal_idx
  ON public.card_target_locks (proposal_id, section_id);

GRANT SELECT ON public.card_target_locks TO authenticated;
GRANT ALL ON public.card_target_locks TO service_role;

ALTER TABLE public.card_target_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locks_select" ON public.card_target_locks;
CREATE POLICY "locks_select" ON public.card_target_locks
  FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

ALTER TABLE public.card_target_locks REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.card_target_locks;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END$$;

-- ============ 2. VERSION COUNTERS ============
ALTER TABLE public.card_fields
  ADD COLUMN IF NOT EXISTS content_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS heading_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.proposal_cards
  ADD COLUMN IF NOT EXISTS title_version integer NOT NULL DEFAULT 1;

-- ============ 3. LOCK FUNCTIONS ============
CREATE OR REPLACE FUNCTION public.acquire_card_lock(
  p_proposal_id uuid,
  p_target_type text,
  p_target_id text,
  p_section_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_name text;
  v_avatar text;
  v_row public.card_target_locks;
BEGIN
  IF v_uid IS NULL OR NOT public.can_edit_proposal(v_uid, p_proposal_id) THEN
    RAISE EXCEPTION 'Not allowed to edit this proposal';
  END IF;

  -- Server-side stale expiry: any expired lock is dropped on every attempt.
  DELETE FROM public.card_target_locks WHERE expires_at < now();

  SELECT COALESCE(NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')), ''), full_name, email),
         avatar_url
    INTO v_name, v_avatar
  FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.card_target_locks AS l
    (proposal_id, section_id, target_type, target_id, user_id, user_name, avatar_url)
  VALUES (p_proposal_id, p_section_id, p_target_type, p_target_id, v_uid, v_name, v_avatar)
  ON CONFLICT (target_type, target_id) DO UPDATE
    SET last_heartbeat_at = now(),
        expires_at = now() + interval '45 seconds',
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
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_card_lock(
  p_target_type text,
  p_target_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_hit integer;
BEGIN
  DELETE FROM public.card_target_locks WHERE expires_at < now();
  UPDATE public.card_target_locks
     SET last_heartbeat_at = now(), expires_at = now() + interval '45 seconds'
   WHERE target_type = p_target_type AND target_id = p_target_id AND user_id = v_uid;
  GET DIAGNOSTICS v_hit = ROW_COUNT;
  RETURN v_hit > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_card_lock(
  p_target_type text,
  p_target_id text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.card_target_locks
   WHERE target_type = p_target_type AND target_id = p_target_id AND user_id = auth.uid();
END;
$$;

-- ============ 4. VERSION-CHECKED SAVES ============
CREATE OR REPLACE FUNCTION public.save_card_text(
  p_field_id uuid,
  p_text_box text,
  p_value text,
  p_expected_version integer,
  p_is_auto_save boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_field public.card_fields;
  v_current integer;
  v_stored text;
BEGIN
  SELECT * INTO v_field FROM public.card_fields WHERE id = p_field_id;
  IF v_field.id IS NULL THEN RAISE EXCEPTION 'Module not found'; END IF;
  IF v_uid IS NULL OR NOT public.can_edit_proposal(v_uid, v_field.proposal_id) THEN
    RAISE EXCEPTION 'Not allowed to edit this proposal';
  END IF;
  IF p_text_box NOT IN ('header','content') THEN
    RAISE EXCEPTION 'Unknown text box %', p_text_box;
  END IF;

  IF p_text_box = 'content' THEN
    v_current := v_field.content_version; v_stored := v_field.content_html;
  ELSE
    v_current := v_field.heading_version; v_stored := v_field.heading;
  END IF;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_current THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true,
      'version', v_current, 'value', v_stored);
  END IF;

  IF p_text_box = 'content' THEN
    UPDATE public.card_fields
       SET content_html = p_value, content_version = content_version + 1, updated_at = now()
     WHERE id = p_field_id;
  ELSE
    UPDATE public.card_fields
       SET heading = NULLIF(p_value, ''), heading_version = heading_version + 1, updated_at = now()
     WHERE id = p_field_id;
  END IF;

  PERFORM public.save_card_field_version(p_field_id, p_text_box, p_value, p_is_auto_save);

  RETURN jsonb_build_object('ok', true, 'conflict', false, 'version', v_current + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_card_title(
  p_card_id uuid,
  p_title text,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_card public.proposal_cards;
BEGIN
  SELECT * INTO v_card FROM public.proposal_cards WHERE id = p_card_id;
  IF v_card.id IS NULL THEN RAISE EXCEPTION 'Block not found'; END IF;
  IF v_uid IS NULL OR NOT public.can_edit_proposal(v_uid, v_card.proposal_id) THEN
    RAISE EXCEPTION 'Not allowed to edit this proposal';
  END IF;

  IF p_expected_version IS NOT NULL AND p_expected_version <> v_card.title_version THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true,
      'version', v_card.title_version, 'value', v_card.title);
  END IF;

  UPDATE public.proposal_cards
     SET title = NULLIF(p_title, ''), title_version = title_version + 1, updated_at = now()
   WHERE id = p_card_id;

  RETURN jsonb_build_object('ok', true, 'conflict', false, 'version', v_card.title_version + 1);
END;
$$;

GRANT EXECUTE ON FUNCTION public.acquire_card_lock(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_card_lock(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_card_lock(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_card_text(uuid, text, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_card_title(uuid, text, integer) TO authenticated;