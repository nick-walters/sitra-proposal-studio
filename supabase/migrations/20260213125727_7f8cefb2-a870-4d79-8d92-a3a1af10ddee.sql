
-- Fix: Convert profiles_basic from SECURITY DEFINER to SECURITY INVOKER view
-- This resolves the Supabase linter warning about security_definer_view

-- 1. Drop the existing SECURITY DEFINER view
DROP VIEW IF EXISTS public.profiles_basic;

-- 2. Add co-member SELECT policy on profiles so the SECURITY INVOKER view can read through RLS
CREATE POLICY "Co-members can view profiles"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    EXISTS (
      SELECT 1 FROM public.user_roles ur1
      JOIN public.user_roles ur2 ON ur1.proposal_id = ur2.proposal_id
      WHERE ur1.user_id = auth.uid()
        AND ur2.user_id = profiles.id
        AND ur1.proposal_id IS NOT NULL
    )
    OR public.is_global_admin(auth.uid())
    OR public.is_owner(auth.uid())
  )
);

-- 3. Recreate view as SECURITY INVOKER (uses querying user's permissions)
CREATE OR REPLACE VIEW public.profiles_basic
WITH (security_invoker = true)
AS
SELECT p.id, p.full_name, p.first_name, p.last_name, p.email, p.avatar_url, p.organisation
FROM public.profiles p;

-- Grant access
GRANT SELECT ON public.profiles_basic TO authenticated;
GRANT SELECT ON public.profiles_basic TO anon;
