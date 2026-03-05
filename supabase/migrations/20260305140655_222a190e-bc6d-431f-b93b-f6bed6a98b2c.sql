
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can insert own availability" ON public.user_availability;
DROP POLICY IF EXISTS "Users can delete own availability" ON public.user_availability;

-- New INSERT policy: own availability OR coordinator/admin/owner of the proposal
CREATE POLICY "Users can insert availability"
ON public.user_availability
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  OR public.is_proposal_admin(auth.uid(), proposal_id)
);

-- New DELETE policy: own availability OR coordinator/admin/owner of the proposal
CREATE POLICY "Users can delete availability"
ON public.user_availability
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_proposal_admin(auth.uid(), proposal_id)
);
