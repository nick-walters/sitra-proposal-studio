
CREATE OR REPLACE FUNCTION public.can_edit_proposal(_user_id UUID, _proposal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        (proposal_id = _proposal_id AND role IN ('owner', 'admin', 'editor'))
        OR
        (proposal_id IS NULL AND role IN ('owner', 'admin'))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.has_any_proposal_role(_user_id UUID, _proposal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        proposal_id = _proposal_id
        OR
        (proposal_id IS NULL AND role IN ('owner', 'admin'))
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.is_proposal_admin(_user_id UUID, _proposal_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        (proposal_id = _proposal_id AND role IN ('owner', 'admin'))
        OR
        (proposal_id IS NULL AND role IN ('owner', 'admin'))
      )
  )
$$;
