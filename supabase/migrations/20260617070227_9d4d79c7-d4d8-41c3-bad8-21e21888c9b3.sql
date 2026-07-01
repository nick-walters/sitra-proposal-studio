
-- 1. Restrict SELECT policies on reference tables to authenticated users only.
-- These were previously open to {public} (anon), violating the project's security
-- requirement that anonymous reads should never happen.

DROP POLICY IF EXISTS "Anyone can view common figures" ON public.common_figures;
CREATE POLICY "Authenticated users can view common figures"
  ON public.common_figures FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view section guidelines" ON public.section_guidelines;
CREATE POLICY "Authenticated users can view section guidelines"
  ON public.section_guidelines FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view template sections" ON public.template_sections;
CREATE POLICY "Authenticated users can view template sections"
  ON public.template_sections FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view template types" ON public.template_types;
CREATE POLICY "Authenticated users can view template types"
  ON public.template_types FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view template form fields" ON public.template_form_fields;
CREATE POLICY "Authenticated users can view template form fields"
  ON public.template_form_fields FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view template modifiers" ON public.template_modifiers;
CREATE POLICY "Authenticated users can view template modifiers"
  ON public.template_modifiers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view funding rules" ON public.funding_rules;
CREATE POLICY "Authenticated users can view funding rules"
  ON public.funding_rules FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view funding programmes" ON public.funding_programmes;
CREATE POLICY "Authenticated users can view funding programmes"
  ON public.funding_programmes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view work programme extensions" ON public.work_programme_extensions;
CREATE POLICY "Authenticated users can view work programme extensions"
  ON public.work_programme_extensions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Anyone can view budget templates" ON public.budget_templates;
CREATE POLICY "Authenticated users can view budget templates"
  ON public.budget_templates FOR SELECT TO authenticated USING (true);

-- 2. Tighten is_owner() so it only returns true for GLOBAL owners
-- (proposal_id IS NULL). Previously any user holding role='owner' on a
-- specific proposal would satisfy global-admin checks, opening a privilege
-- escalation path on globally-scoped tables.
CREATE OR REPLACE FUNCTION public.is_owner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'owner'
      AND proposal_id IS NULL
  )
$$;

-- 3. Replace the inline "Owners can manage ..." policies on global reference
-- tables with a check that explicitly requires global-admin scope. This
-- closes the same privilege-escalation class on the management side and
-- removes the dependency on the older loose owner check.
DROP POLICY IF EXISTS "Owners can manage common figures" ON public.common_figures;
CREATE POLICY "Global admins can manage common figures"
  ON public.common_figures FOR ALL TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can manage section guidelines" ON public.section_guidelines;
CREATE POLICY "Global admins can manage section guidelines"
  ON public.section_guidelines FOR ALL TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can manage template sections" ON public.template_sections;
CREATE POLICY "Global admins can manage template sections"
  ON public.template_sections FOR ALL TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can manage template types" ON public.template_types;
CREATE POLICY "Global admins can manage template types"
  ON public.template_types FOR ALL TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can manage template form fields" ON public.template_form_fields;
CREATE POLICY "Global admins can manage template form fields"
  ON public.template_form_fields FOR ALL TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can manage template modifiers" ON public.template_modifiers;
CREATE POLICY "Global admins can manage template modifiers"
  ON public.template_modifiers FOR ALL TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can manage funding rules" ON public.funding_rules;
CREATE POLICY "Global admins can manage funding rules"
  ON public.funding_rules FOR ALL TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can manage funding programmes" ON public.funding_programmes;
CREATE POLICY "Global admins can manage funding programmes"
  ON public.funding_programmes FOR ALL TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can manage work programme extensions" ON public.work_programme_extensions;
CREATE POLICY "Global admins can manage work programme extensions"
  ON public.work_programme_extensions FOR ALL TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

DROP POLICY IF EXISTS "Owners can manage budget templates" ON public.budget_templates;
CREATE POLICY "Global admins can manage budget templates"
  ON public.budget_templates FOR ALL TO authenticated
  USING (public.is_global_admin(auth.uid()))
  WITH CHECK (public.is_global_admin(auth.uid()));

-- 4. Tighten the proposal-logos upload policy so a user can only upload into
-- their own user-id folder (matching the existing delete/update policy on
-- the same bucket). Previously any authenticated user could upload anywhere
-- in this bucket.
DROP POLICY IF EXISTS "Users can upload proposal logos" ON storage.objects;
CREATE POLICY "Users can upload proposal logos"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'proposal-logos'
    AND (auth.uid())::text = (storage.foldername(name))[1]
  );
