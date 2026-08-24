DO $$
DECLARE
  r record;
  src text;
  newsrc text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc ILIKE '%is_global_admin%'
      AND p.prosrc ILIKE '%restricted to platform owners%'
      AND p.proname <> 'purge_deleted_cards'
  LOOP
    src := pg_get_functiondef(r.oid);
    newsrc := regexp_replace(
      src,
      '--\s*TEMPORARY[^\n]*\n(\s*--[^\n]*\n)*',
      '',
      'gi'
    );
    newsrc := replace(newsrc, 'public.is_global_admin(auth.uid())', 'public.can_edit_proposal(p_proposal_id)');
    newsrc := replace(newsrc, 'is_global_admin(auth.uid())', 'public.can_edit_proposal(p_proposal_id)');
    newsrc := replace(newsrc, 'The cards board is restricted to platform owners during beta', 'You do not have permission to edit this proposal');
    IF newsrc ILIKE '%is_global_admin%' OR newsrc ILIKE '%restricted to platform owners%' THEN
      RAISE EXCEPTION 'Function %: guard rewrite incomplete', r.proname;
    END IF;
    EXECUTE newsrc;
  END LOOP;
END $$;