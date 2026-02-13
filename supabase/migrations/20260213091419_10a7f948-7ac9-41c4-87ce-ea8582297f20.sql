
-- 1. Add GDPR consent column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gdpr_consented_at timestamptz DEFAULT NULL;

-- 2. Replace the overly permissive SELECT policy with proper access control
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

-- Users can always read their own profile
CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

-- Users can view profiles of others who share a proposal with them
CREATE POLICY "Users can view proposal co-members"
ON public.profiles FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur1
    JOIN public.user_roles ur2 ON ur1.proposal_id = ur2.proposal_id
    WHERE ur1.user_id = auth.uid()
      AND ur2.user_id = profiles.id
      AND ur1.proposal_id IS NOT NULL
  )
);

-- Global admins and owners can view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
USING (
  public.is_global_admin(auth.uid()) OR public.is_owner(auth.uid())
);
