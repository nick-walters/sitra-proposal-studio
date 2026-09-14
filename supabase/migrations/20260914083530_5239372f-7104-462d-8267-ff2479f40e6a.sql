-- 1. Lock columns on the participant row itself
ALTER TABLE public.participants
  ADD COLUMN IF NOT EXISTS info_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS info_locked_by uuid,
  ADD COLUMN IF NOT EXISTS info_locked_at timestamptz;

-- 2. Single helper: may this user write this participant's information right now?
--    Absolute lock: a locked participant returns false for everybody, coordinators included.
CREATE OR REPLACE FUNCTION public.participant_info_editable(_participant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _locked boolean;
BEGIN
  IF _participant_id IS NULL THEN
    RETURN false;
  END IF;
  SELECT p.info_locked INTO _locked FROM public.participants p WHERE p.id = _participant_id;
  IF _locked IS NULL THEN
    RETURN false;
  END IF;
  IF _locked THEN
    RETURN false;
  END IF;
  RETURN public.can_edit_participant_budget(auth.uid(), _participant_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.participant_info_editable(uuid) TO authenticated;

-- 3. Guard on the participants row: the lock itself stays writable by coordinators,
--    every other column is frozen while locked.
CREATE OR REPLACE FUNCTION public.participants_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.info_locked THEN
      RAISE EXCEPTION 'Participant information is locked. A coordinator must unlock it first.'
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.info_locked IS DISTINCT FROM OLD.info_locked THEN
    IF NOT public.is_proposal_admin(auth.uid(), OLD.proposal_id) THEN
      RAISE EXCEPTION 'Only a coordinator can lock or unlock participant information.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF OLD.info_locked AND NEW.info_locked THEN
    -- Locked and staying locked: nothing but the lock bookkeeping may change.
    IF (to_jsonb(NEW) - 'info_locked' - 'info_locked_by' - 'info_locked_at')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'info_locked' - 'info_locked_by' - 'info_locked_at') THEN
      RAISE EXCEPTION 'Participant information is locked. A coordinator must unlock it first.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS participants_lock_guard_trg ON public.participants;
CREATE TRIGGER participants_lock_guard_trg
  BEFORE UPDATE OR DELETE ON public.participants
  FOR EACH ROW EXECUTE FUNCTION public.participants_lock_guard();

-- 4. participants: tighten writes to the participant-scoped rule, keeping
--    insertion and lock administration with proposal editors/coordinators.
DROP POLICY IF EXISTS "Admins and editors can manage participants" ON public.participants;

CREATE POLICY "Editors can insert participants"
  ON public.participants FOR INSERT TO authenticated
  WITH CHECK (can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Listed members and coordinators can update participants"
  ON public.participants FOR UPDATE TO authenticated
  USING (public.participant_info_editable(id) OR is_proposal_admin(auth.uid(), proposal_id))
  WITH CHECK (public.participant_info_editable(id) OR is_proposal_admin(auth.uid(), proposal_id));

CREATE POLICY "Editors can delete participants"
  ON public.participants FOR DELETE TO authenticated
  USING (can_edit_proposal(auth.uid(), proposal_id) AND NOT info_locked);

-- 5. Child tables keyed directly by participant_id
DROP POLICY IF EXISTS "Admins and editors can manage participant members" ON public.participant_members;
CREATE POLICY "Listed members can manage participant members"
  ON public.participant_members FOR ALL TO authenticated
  USING (public.participant_info_editable(participant_id))
  WITH CHECK (public.participant_info_editable(participant_id));

DROP POLICY IF EXISTS "Users can manage researchers for editable proposals" ON public.participant_researchers;
CREATE POLICY "Listed members can manage researchers"
  ON public.participant_researchers FOR ALL TO authenticated
  USING (public.participant_info_editable(participant_id))
  WITH CHECK (public.participant_info_editable(participant_id));

DROP POLICY IF EXISTS "Users can manage achievements for editable proposals" ON public.participant_achievements;
CREATE POLICY "Listed members can manage achievements"
  ON public.participant_achievements FOR ALL TO authenticated
  USING (public.participant_info_editable(participant_id))
  WITH CHECK (public.participant_info_editable(participant_id));

DROP POLICY IF EXISTS "Users can manage projects for editable proposals" ON public.participant_previous_projects;
CREATE POLICY "Listed members can manage previous projects"
  ON public.participant_previous_projects FOR ALL TO authenticated
  USING (public.participant_info_editable(participant_id))
  WITH CHECK (public.participant_info_editable(participant_id));

DROP POLICY IF EXISTS "Users can manage infrastructure for editable proposals" ON public.participant_infrastructure;
CREATE POLICY "Listed members can manage infrastructure"
  ON public.participant_infrastructure FOR ALL TO authenticated
  USING (public.participant_info_editable(participant_id))
  WITH CHECK (public.participant_info_editable(participant_id));

DROP POLICY IF EXISTS "Users can manage departments for editable proposals" ON public.participant_departments;
CREATE POLICY "Listed members can manage departments"
  ON public.participant_departments FOR ALL TO authenticated
  USING (public.participant_info_editable(participant_id))
  WITH CHECK (public.participant_info_editable(participant_id));

DROP POLICY IF EXISTS "Users can manage dependencies for editable proposals" ON public.participant_dependencies;
CREATE POLICY "Listed members can manage dependencies"
  ON public.participant_dependencies FOR ALL TO authenticated
  USING (public.participant_info_editable(participant_id))
  WITH CHECK (public.participant_info_editable(participant_id));

DROP POLICY IF EXISTS "Users can manage org roles for editable proposals" ON public.participant_organisation_roles;
CREATE POLICY "Listed members can manage org roles"
  ON public.participant_organisation_roles FOR ALL TO authenticated
  USING (public.participant_info_editable(participant_id))
  WITH CHECK (public.participant_info_editable(participant_id));

-- 6. participant_descriptions (participant_id + proposal_id)
DROP POLICY IF EXISTS "Editors can insert participant descriptions" ON public.participant_descriptions;
DROP POLICY IF EXISTS "Editors can update participant descriptions" ON public.participant_descriptions;
DROP POLICY IF EXISTS "Editors can delete participant descriptions" ON public.participant_descriptions;

CREATE POLICY "Listed members can insert participant descriptions"
  ON public.participant_descriptions FOR INSERT TO authenticated
  WITH CHECK (public.participant_info_editable(participant_id));

CREATE POLICY "Listed members can update participant descriptions"
  ON public.participant_descriptions FOR UPDATE TO authenticated
  USING (public.participant_info_editable(participant_id))
  WITH CHECK (public.participant_info_editable(participant_id));

CREATE POLICY "Listed members can delete participant descriptions"
  ON public.participant_descriptions FOR DELETE TO authenticated
  USING (public.participant_info_editable(participant_id));

-- 7. Ownership control declaration uploads
DROP POLICY IF EXISTS "ocd_uploads_insert" ON public.participant_ocd_uploads;
DROP POLICY IF EXISTS "ocd_uploads_update" ON public.participant_ocd_uploads;
DROP POLICY IF EXISTS "ocd_uploads_delete" ON public.participant_ocd_uploads;

CREATE POLICY "ocd_uploads_insert"
  ON public.participant_ocd_uploads FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND public.participant_info_editable(participant_id));

CREATE POLICY "ocd_uploads_update"
  ON public.participant_ocd_uploads FOR UPDATE TO authenticated
  USING (public.participant_info_editable(participant_id))
  WITH CHECK (public.participant_info_editable(participant_id));

CREATE POLICY "ocd_uploads_delete"
  ON public.participant_ocd_uploads FOR DELETE TO authenticated
  USING (public.participant_info_editable(participant_id));

-- 8. Capacity (expertise) matrix: a cell belongs to a column, which may belong
--    to a participant. Participant columns follow the participant lock; other
--    columns keep the proposal-level rule.
CREATE OR REPLACE FUNCTION public.expertise_cell_editable(_column_id uuid, _row_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _participant_id uuid;
  _proposal_id uuid;
BEGIN
  SELECT c.participant_id, c.proposal_id INTO _participant_id, _proposal_id
  FROM public.expertise_matrix_columns c WHERE c.id = _column_id;

  IF _participant_id IS NOT NULL THEN
    RETURN public.participant_info_editable(_participant_id);
  END IF;

  IF _proposal_id IS NULL THEN
    SELECT r.proposal_id INTO _proposal_id FROM public.expertise_matrix_rows r WHERE r.id = _row_id;
  END IF;

  RETURN public.can_edit_proposal(auth.uid(), _proposal_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.expertise_cell_editable(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Editors can insert expertise cells" ON public.expertise_matrix_cells;
DROP POLICY IF EXISTS "Editors can update expertise cells" ON public.expertise_matrix_cells;
DROP POLICY IF EXISTS "Editors can delete expertise cells" ON public.expertise_matrix_cells;

CREATE POLICY "Editors can insert expertise cells"
  ON public.expertise_matrix_cells FOR INSERT TO authenticated
  WITH CHECK (public.expertise_cell_editable(column_id, row_id));

CREATE POLICY "Editors can update expertise cells"
  ON public.expertise_matrix_cells FOR UPDATE TO authenticated
  USING (public.expertise_cell_editable(column_id, row_id))
  WITH CHECK (public.expertise_cell_editable(column_id, row_id));

CREATE POLICY "Editors can delete expertise cells"
  ON public.expertise_matrix_cells FOR DELETE TO authenticated
  USING (public.expertise_cell_editable(column_id, row_id));

-- The participant's own matrix column must not be renamed or removed while locked.
DROP POLICY IF EXISTS "Editors can update expertise columns" ON public.expertise_matrix_columns;
DROP POLICY IF EXISTS "Editors can delete expertise columns" ON public.expertise_matrix_columns;

CREATE POLICY "Editors can update expertise columns"
  ON public.expertise_matrix_columns FOR UPDATE TO authenticated
  USING (CASE WHEN participant_id IS NOT NULL
              THEN public.participant_info_editable(participant_id)
              ELSE can_edit_proposal(auth.uid(), proposal_id) END)
  WITH CHECK (CASE WHEN participant_id IS NOT NULL
              THEN public.participant_info_editable(participant_id)
              ELSE can_edit_proposal(auth.uid(), proposal_id) END);

CREATE POLICY "Editors can delete expertise columns"
  ON public.expertise_matrix_columns FOR DELETE TO authenticated
  USING (CASE WHEN participant_id IS NOT NULL
              THEN public.participant_info_editable(participant_id)
              ELSE can_edit_proposal(auth.uid(), proposal_id) END);