-- Fix user_roles RLS to allow users to view their own roles for auth checks
-- This is needed so the useUserRole hook can check if the current user is an admin/owner

-- Drop the existing restrictive SELECT policy
DROP POLICY IF EXISTS "Users can view roles for their proposals" ON public.user_roles;

-- Create a more permissive policy that allows users to view their own roles
CREATE POLICY "Users can view own roles" 
ON public.user_roles 
FOR SELECT 
USING (user_id = auth.uid());

-- Also allow proposal members to see roles on their proposals (needed for collaboration features)
CREATE POLICY "Users can view proposal roles" 
ON public.user_roles 
FOR SELECT 
USING (has_any_proposal_role(auth.uid(), proposal_id));