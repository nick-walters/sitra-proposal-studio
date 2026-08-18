DO $do$
DECLARE
  r record;
  v_def text;
  v_guard text := E'\n  -- TEMPORARY DEVELOPMENT RESTRICTION (beta cards board, added 2026-08-18):\n  -- platform owners/admins only (public.is_global_admin). MUST be relaxed to\n  -- public.can_edit_proposal() at cutover, before the cards feature ships.\n  IF NOT public.is_global_admin(auth.uid()) THEN\n    RAISE EXCEPTION ''The cards board is restricted to platform owners during beta'';\n  END IF;\n';
  v_pos int;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_manual_text_card','create_card_field','reorder_section_cards',
        'reorder_card_fields','save_card_text','save_card_title','save_card_field_version',
        'soft_delete_card','soft_delete_card_field','restore_card','restore_card_field',
        'acquire_card_lock','heartbeat_card_lock','release_card_lock',
        'migrate_b12_to_cards','seed_proposal_cards')
  LOOP
    v_def := r.def;
    IF v_def LIKE '%TEMPORARY DEVELOPMENT RESTRICTION%' THEN
      CONTINUE;
    END IF;
    v_pos := (regexp_instr(v_def, '(?n)^\s*BEGIN\s*$', 1, 1, 1, 'i'));
    IF v_pos = 0 THEN
      RAISE EXCEPTION 'No outer BEGIN found in %', r.proname;
    END IF;
    v_def := left(v_def, v_pos - 1) || v_guard || substr(v_def, v_pos);
    EXECUTE v_def;
  END LOOP;
END
$do$;