-- Create a security definer function to check for global admin role (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.is_global_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'admin'
      AND proposal_id IS NULL
  )
$$;

-- Drop the recursive policy
DROP POLICY IF EXISTS "Global admins can manage proposal roles" ON public.user_roles;

-- Recreate it using the security definer function
CREATE POLICY "Global admins can manage proposal roles"
ON public.user_roles FOR ALL
USING (
  proposal_id IS NOT NULL 
  AND public.is_global_admin(auth.uid())
);