-- 1. table_captions / table_column_widths / table_column_headers
DROP POLICY IF EXISTS "Users can view captions for their proposals" ON public.table_captions;
DROP POLICY IF EXISTS "Coordinators can insert captions" ON public.table_captions;
DROP POLICY IF EXISTS "Coordinators can update captions" ON public.table_captions;

CREATE POLICY "table_captions_select" ON public.table_captions
  FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "table_captions_insert" ON public.table_captions
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));
CREATE POLICY "table_captions_update" ON public.table_captions
  FOR UPDATE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

DROP POLICY IF EXISTS "Users can view column widths for their proposals" ON public.table_column_widths;
DROP POLICY IF EXISTS "Coordinators can insert column widths" ON public.table_column_widths;
DROP POLICY IF EXISTS "Coordinators can update column widths" ON public.table_column_widths;

CREATE POLICY "table_column_widths_select" ON public.table_column_widths
  FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "table_column_widths_insert" ON public.table_column_widths
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));
CREATE POLICY "table_column_widths_update" ON public.table_column_widths
  FOR UPDATE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

DROP POLICY IF EXISTS "Users can view column headers for their proposals" ON public.table_column_headers;
DROP POLICY IF EXISTS "Coordinators can insert column headers" ON public.table_column_headers;
DROP POLICY IF EXISTS "Coordinators can update column headers" ON public.table_column_headers;

CREATE POLICY "table_column_headers_select" ON public.table_column_headers
  FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "table_column_headers_insert" ON public.table_column_headers
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));
CREATE POLICY "table_column_headers_update" ON public.table_column_headers
  FOR UPDATE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

-- 2. restore_proposal_snapshot: admin-only
DO $do$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'restore_proposal_snapshot';

  v_def := replace(
    v_def,
    'IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION ''Permission denied: caller cannot edit this proposal'';',
    'IF auth.uid() IS NULL OR NOT public.is_proposal_admin(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION ''Permission denied: only coordinators and above can restore a snapshot'';'
  );

  IF v_def NOT LIKE '%is_proposal_admin(auth.uid(), p_proposal_id)%' THEN
    RAISE EXCEPTION 'Could not patch restore_proposal_snapshot permission check';
  END IF;

  EXECUTE v_def;
END
$do$;

-- 3. section_comments
DROP POLICY IF EXISTS "Authors, admins and coordinators can update comments" ON public.section_comments;
DROP POLICY IF EXISTS "Users with proposal access can view comments" ON public.section_comments;
DROP POLICY IF EXISTS "Users with edit access can create comments" ON public.section_comments;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.section_comments;

CREATE POLICY "Users with proposal access can view comments" ON public.section_comments
  FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Users with edit access can create comments" ON public.section_comments
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));
CREATE POLICY "Authors and proposal admins can update comments" ON public.section_comments
  FOR UPDATE TO authenticated
  USING ((user_id = auth.uid()) OR public.is_proposal_admin(auth.uid(), proposal_id))
  WITH CHECK ((user_id = auth.uid()) OR public.is_proposal_admin(auth.uid(), proposal_id));
CREATE POLICY "Users can delete their own comments" ON public.section_comments
  FOR DELETE TO authenticated
  USING ((user_id = auth.uid()) OR public.is_proposal_admin(auth.uid(), proposal_id));
