
REVOKE EXECUTE ON FUNCTION public.has_proposal_role(uuid, uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_any_proposal_role(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_edit_proposal(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_global_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_owner(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_coordinator_or_above(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_proposal_admin(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_message_recipient(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_my_private_profile() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.insert_section_version(uuid, text, text, uuid, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.thin_section_versions(uuid) FROM anon, public;
