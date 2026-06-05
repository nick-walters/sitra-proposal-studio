CREATE OR REPLACE FUNCTION public.allow_section_version_cascade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('app.allow_thinning', 'true', true);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS allow_section_version_cascade_on_proposal_delete ON public.proposals;
CREATE TRIGGER allow_section_version_cascade_on_proposal_delete
BEFORE DELETE ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.allow_section_version_cascade();