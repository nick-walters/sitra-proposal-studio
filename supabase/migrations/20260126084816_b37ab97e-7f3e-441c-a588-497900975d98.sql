-- Fix is_proposal_admin function to include both admin and owner roles
CREATE OR REPLACE FUNCTION public.is_proposal_admin(_user_id uuid, _proposal_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND proposal_id = _proposal_id
      AND role IN ('admin', 'owner')
  )
$function$;