
-- Helper function: check if user is admin/owner or coordinator on any proposal
CREATE OR REPLACE FUNCTION public.is_coordinator_or_above(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND (
        (role IN ('owner', 'admin') AND proposal_id IS NULL)
        OR role = 'coordinator'
      )
  )
$$;

-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can view all snippets" ON public.snippet_library;
DROP POLICY IF EXISTS "Authenticated users can create snippets" ON public.snippet_library;
DROP POLICY IF EXISTS "Users can update their own snippets" ON public.snippet_library;
DROP POLICY IF EXISTS "Users can delete their own snippets" ON public.snippet_library;

-- New restrictive policies
CREATE POLICY "Coordinators and admins can view snippets"
ON public.snippet_library FOR SELECT
USING (public.is_coordinator_or_above(auth.uid()));

CREATE POLICY "Coordinators and admins can create snippets"
ON public.snippet_library FOR INSERT
WITH CHECK (auth.uid() = created_by AND public.is_coordinator_or_above(auth.uid()));

CREATE POLICY "Coordinators and admins can update own snippets"
ON public.snippet_library FOR UPDATE
USING (auth.uid() = created_by AND public.is_coordinator_or_above(auth.uid()));

CREATE POLICY "Coordinators and admins can delete own snippets"
ON public.snippet_library FOR DELETE
USING (auth.uid() = created_by AND public.is_coordinator_or_above(auth.uid()));
