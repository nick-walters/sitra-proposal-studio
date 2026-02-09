-- Drop existing policies that don't handle global roles properly
DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view proposal roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can add themselves when creating proposal" ON public.user_roles;

-- SELECT: Users can see their own roles
CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
USING (user_id = auth.uid());

-- SELECT: Owners can see all roles (for user rights admin)
CREATE POLICY "Owners can view all roles"
ON public.user_roles FOR SELECT
USING (public.is_owner(auth.uid()));

-- SELECT: Proposal admins can see roles for their proposals
CREATE POLICY "Proposal admins can view proposal roles"
ON public.user_roles FOR SELECT
USING (proposal_id IS NOT NULL AND public.is_proposal_admin(auth.uid(), proposal_id));

-- INSERT: Owners can add any role
CREATE POLICY "Owners can insert roles"
ON public.user_roles FOR INSERT
WITH CHECK (public.is_owner(auth.uid()));

-- INSERT: Users can add themselves when creating a proposal (via RPC, but keep as fallback)
CREATE POLICY "Users can add own proposal roles"
ON public.user_roles FOR INSERT
WITH CHECK (user_id = auth.uid() AND proposal_id IS NOT NULL);

-- UPDATE: Owners can update any role
CREATE POLICY "Owners can update roles"
ON public.user_roles FOR UPDATE
USING (public.is_owner(auth.uid()));

-- DELETE: Owners can remove any role
CREATE POLICY "Owners can delete roles"
ON public.user_roles FOR DELETE
USING (public.is_owner(auth.uid()));

-- Also allow global admins to manage proposal-level roles
CREATE POLICY "Global admins can manage proposal roles"
ON public.user_roles FOR ALL
USING (
  proposal_id IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role = 'admin' 
    AND ur.proposal_id IS NULL
  )
);