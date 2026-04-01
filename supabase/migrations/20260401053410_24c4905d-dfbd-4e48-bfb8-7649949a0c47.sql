CREATE POLICY "Admins can update any profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (is_global_admin(auth.uid()) OR is_owner(auth.uid()))
WITH CHECK (is_global_admin(auth.uid()) OR is_owner(auth.uid()));