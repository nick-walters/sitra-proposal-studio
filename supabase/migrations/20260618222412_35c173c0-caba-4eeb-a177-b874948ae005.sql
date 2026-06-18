DROP TRIGGER IF EXISTS trg_cleanup_orgs_on_participant_change ON public.participants;
DROP TRIGGER IF EXISTS trg_cleanup_orgs_on_profile_update ON public.profiles;
DROP FUNCTION IF EXISTS public.cleanup_orphaned_organisations_participant();
DROP FUNCTION IF EXISTS public.cleanup_orphaned_organisations();