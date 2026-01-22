-- Fix can_edit_proposal function to include owner role
CREATE OR REPLACE FUNCTION public.can_edit_proposal(_user_id uuid, _proposal_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND proposal_id = _proposal_id
      AND role IN ('owner', 'admin', 'editor')
  )
$$;