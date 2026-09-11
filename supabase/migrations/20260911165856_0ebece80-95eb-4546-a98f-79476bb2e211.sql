-- 1. user_roles: add WITH CHECK matching USING
DROP POLICY IF EXISTS "Owners can update roles" ON public.user_roles;
CREATE POLICY "Owners can update roles"
ON public.user_roles
FOR UPDATE
USING (is_owner(auth.uid()))
WITH CHECK (is_owner(auth.uid()));

-- 2. proposals: add WITH CHECK matching USING
DROP POLICY IF EXISTS "Admins can update proposals" ON public.proposals;
CREATE POLICY "Admins can update proposals"
ON public.proposals
FOR UPDATE
TO authenticated
USING (is_proposal_admin(auth.uid(), id))
WITH CHECK (is_proposal_admin(auth.uid(), id));

-- 3. Drop redundant duplicate avatar policies (role public, no admin clause)
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;