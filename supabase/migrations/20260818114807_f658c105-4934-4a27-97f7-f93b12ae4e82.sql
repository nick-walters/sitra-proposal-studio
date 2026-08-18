DO $$
DECLARE r record; v_def text;
BEGIN
  FOR r IN
    SELECT p.oid, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('acquire_card_lock','heartbeat_card_lock')
  LOOP
    v_def := replace(r.def, '''45 seconds''', '''150 seconds''');
    IF v_def <> r.def THEN
      EXECUTE v_def;
    END IF;
  END LOOP;
END$$;

ALTER TABLE public.card_target_locks
  ALTER COLUMN expires_at SET DEFAULT now() + interval '150 seconds';