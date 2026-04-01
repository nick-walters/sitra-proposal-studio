
-- Function to clean up orphaned organisations
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_organisations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- If the organisation name changed, check if the OLD one is now orphaned
  IF OLD.organisation IS NOT NULL AND OLD.organisation IS DISTINCT FROM NEW.organisation THEN
    DELETE FROM public.organisations
    WHERE name = OLD.organisation
      AND NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE organisation = OLD.organisation
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.participants WHERE organisation_name = OLD.organisation
      );
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger on profiles
CREATE TRIGGER trg_cleanup_orgs_on_profile_update
  AFTER UPDATE OF organisation ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_orphaned_organisations();

-- Also clean up when participants are deleted or updated
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_organisations_participant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.organisation_name IS NOT NULL THEN
      DELETE FROM public.organisations
      WHERE name = OLD.organisation_name
        AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE organisation = OLD.organisation_name)
        AND NOT EXISTS (SELECT 1 FROM public.participants WHERE organisation_name = OLD.organisation_name);
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.organisation_name IS NOT NULL AND OLD.organisation_name IS DISTINCT FROM NEW.organisation_name THEN
      DELETE FROM public.organisations
      WHERE name = OLD.organisation_name
        AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE organisation = OLD.organisation_name)
        AND NOT EXISTS (SELECT 1 FROM public.participants WHERE organisation_name = OLD.organisation_name);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_cleanup_orgs_on_participant_change
  AFTER UPDATE OF organisation_name OR DELETE ON public.participants
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_orphaned_organisations_participant();

-- Also do an immediate one-time cleanup of any currently orphaned organisations
DELETE FROM public.organisations
WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE organisation = organisations.name)
  AND NOT EXISTS (SELECT 1 FROM public.participants WHERE organisation_name = organisations.name);
