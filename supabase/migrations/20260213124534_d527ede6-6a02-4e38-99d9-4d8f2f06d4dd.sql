
-- 1. Drop the broad co-member policy that exposes full profile data
DROP POLICY IF EXISTS "Users can view proposal co-members" ON public.profiles;

-- 2. Add restricted policy: only coordinators/admins/owners of shared proposals can see full profiles
CREATE POLICY "Coordinators can view co-member full profiles"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur1
    JOIN public.user_roles ur2 ON ur1.proposal_id = ur2.proposal_id
    WHERE ur1.user_id = auth.uid()
      AND ur2.user_id = profiles.id
      AND ur1.proposal_id IS NOT NULL
      AND ur1.role IN ('coordinator')
  )
);

-- 3. Create profiles_basic view with limited columns (security invoker = false to bypass RLS)
CREATE OR REPLACE VIEW public.profiles_basic
WITH (security_invoker = false)
AS
SELECT p.id, p.full_name, p.first_name, p.last_name, p.email, p.avatar_url, p.organisation
FROM public.profiles p
WHERE p.id = auth.uid()
   OR EXISTS (
     SELECT 1 FROM public.user_roles ur1
     JOIN public.user_roles ur2 ON ur1.proposal_id = ur2.proposal_id
     WHERE ur1.user_id = auth.uid()
       AND ur2.user_id = p.id
       AND ur1.proposal_id IS NOT NULL
   )
   OR public.is_global_admin(auth.uid())
   OR public.is_owner(auth.uid());

-- Grant access to authenticated users
GRANT SELECT ON public.profiles_basic TO authenticated;
GRANT SELECT ON public.profiles_basic TO anon;
