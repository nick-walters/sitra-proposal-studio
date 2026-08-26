-- 1. Drop obsolete single-argument overload of the one-off migration helper
DROP FUNCTION IF EXISTS public.migrate_b12_to_cards(uuid);

-- 2. Keep the remaining migration helper owner-only
CREATE OR REPLACE FUNCTION public.migrate_b12_to_cards(p_proposal_id uuid, p_confirm_overwrite boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_global_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: platform owners only';
  END IF;
  v_result := public._migrate_b12_to_cards_impl(p_proposal_id, p_confirm_overwrite);
  RETURN v_result;
END;
$function$;

-- 3. Revoke unauthenticated EXECUTE (both direct anon grants and PUBLIC grants)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- purge_deleted_cards stays service-role only
REVOKE ALL ON FUNCTION public.purge_deleted_cards() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_deleted_cards() TO service_role;