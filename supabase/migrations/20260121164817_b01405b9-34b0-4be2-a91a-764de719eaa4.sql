-- Drop the existing restrictive INSERT policy and recreate as PERMISSIVE
DROP POLICY IF EXISTS "Authenticated users can create proposals" ON public.proposals;

CREATE POLICY "Authenticated users can create proposals"
ON public.proposals
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);