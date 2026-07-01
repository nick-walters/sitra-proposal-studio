-- 1. Revoke anon EXECUTE from sensitive snapshot/restore functions
REVOKE EXECUTE ON FUNCTION public.create_proposal_snapshot(uuid, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.preview_proposal_restore(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.restore_proposal_snapshot(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.thin_proposal_snapshots(uuid, integer, integer) FROM anon, public;

-- 2. Set explicit search_path on the two flagged IMMUTABLE helpers.
-- They return literal arrays and reference no schema objects; public,pg_temp is safe.
ALTER FUNCTION public.restore_excluded_tables() SET search_path = public, pg_temp;
ALTER FUNCTION public.restore_in_scope_tables() SET search_path = public, pg_temp;