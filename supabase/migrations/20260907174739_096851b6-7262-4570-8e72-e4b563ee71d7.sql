REVOKE EXECUTE ON FUNCTION public.suppress_proposal(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.restore_suppressed_proposal(uuid) FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.suppress_proposal(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_suppressed_proposal(uuid) TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, PUBLIC;