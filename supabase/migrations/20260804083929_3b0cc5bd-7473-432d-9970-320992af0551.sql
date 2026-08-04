-- 1. Restrict people INSERT to users who can actually edit proposals
DROP POLICY IF EXISTS "Users with a proposal role can insert people" ON public.people;

CREATE POLICY "Editors and admins can insert people"
ON public.people
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_global_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('owner', 'admin', 'coordinator', 'editor')
  )
);

-- 2. Remove public/anon execute on internal trigger function
REVOKE ALL ON FUNCTION public.seed_impact_canvas_columns() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.seed_impact_canvas_columns() FROM anon;
REVOKE ALL ON FUNCTION public.seed_impact_canvas_columns() FROM authenticated;