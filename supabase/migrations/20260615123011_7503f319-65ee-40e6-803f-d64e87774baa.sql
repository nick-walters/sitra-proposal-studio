DROP POLICY IF EXISTS "Authenticated users can insert people" ON public.people;
DROP POLICY IF EXISTS "Users can insert people linked to their proposals" ON public.people;

CREATE POLICY "Users with a proposal role can insert people"
ON public.people FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);