-- 1. Organisations: platform-wide registry, so only GLOBAL roles may write.
--    A proposal-scoped coordinator (grantable by any proposal admin) must not
--    be able to edit rows every other proposal depends on.
DROP POLICY IF EXISTS "Coordinators can add organisations" ON public.organisations;
DROP POLICY IF EXISTS "Coordinators can update organisations" ON public.organisations;
DROP POLICY IF EXISTS "Coordinators can delete organisations" ON public.organisations;

CREATE POLICY "Global staff can add organisations"
ON public.organisations FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
    AND ur.proposal_id IS NULL
    AND ur.role = ANY (ARRAY['coordinator'::app_role, 'admin'::app_role, 'owner'::app_role])
));

CREATE POLICY "Global staff can update organisations"
ON public.organisations FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
    AND ur.proposal_id IS NULL
    AND ur.role = ANY (ARRAY['coordinator'::app_role, 'admin'::app_role, 'owner'::app_role])
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
    AND ur.proposal_id IS NULL
    AND ur.role = ANY (ARRAY['coordinator'::app_role, 'admin'::app_role, 'owner'::app_role])
));

CREATE POLICY "Global staff can delete organisations"
ON public.organisations FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id = auth.uid()
    AND ur.proposal_id IS NULL
    AND ur.role = ANY (ARRAY['coordinator'::app_role, 'admin'::app_role, 'owner'::app_role])
));

-- 2. The last function without a pinned search_path.
ALTER FUNCTION public.versioned_table_allowed(text) SET search_path = public;