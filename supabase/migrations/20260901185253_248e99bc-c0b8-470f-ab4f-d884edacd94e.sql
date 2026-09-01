CREATE TABLE public.ls_budget_permission_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  can_edit boolean NOT NULL,
  set_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ls_budget_permission_overrides TO authenticated;
GRANT ALL ON public.ls_budget_permission_overrides TO service_role;

ALTER TABLE public.ls_budget_permission_overrides ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_ls_budget_perm_overrides_proposal ON public.ls_budget_permission_overrides(proposal_id);
CREATE INDEX idx_ls_budget_perm_overrides_participant_user ON public.ls_budget_permission_overrides(participant_id, user_id);

CREATE TRIGGER update_ls_budget_permission_overrides_updated_at
BEFORE UPDATE ON public.ls_budget_permission_overrides
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY ls_budget_permission_overrides_select ON public.ls_budget_permission_overrides
FOR SELECT TO authenticated USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY ls_budget_permission_overrides_insert ON public.ls_budget_permission_overrides
FOR INSERT TO authenticated WITH CHECK (public.is_proposal_admin(auth.uid(), proposal_id));

CREATE POLICY ls_budget_permission_overrides_update ON public.ls_budget_permission_overrides
FOR UPDATE TO authenticated USING (public.is_proposal_admin(auth.uid(), proposal_id))
WITH CHECK (public.is_proposal_admin(auth.uid(), proposal_id));

CREATE POLICY ls_budget_permission_overrides_delete ON public.ls_budget_permission_overrides
FOR DELETE TO authenticated USING (public.is_proposal_admin(auth.uid(), proposal_id));

CREATE OR REPLACE FUNCTION public.can_edit_participant_budget(_user_id uuid, _participant_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _proposal_id uuid;
  _override boolean;
BEGIN
  SELECT p.proposal_id INTO _proposal_id FROM public.participants p WHERE p.id = _participant_id;
  IF _proposal_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.is_proposal_admin(_user_id, _proposal_id) THEN
    RETURN true;
  END IF;

  IF NOT public.has_any_proposal_role(_user_id, _proposal_id) THEN
    RETURN false;
  END IF;

  SELECT o.can_edit INTO _override
  FROM public.ls_budget_permission_overrides o
  WHERE o.participant_id = _participant_id AND o.user_id = _user_id;

  IF FOUND THEN
    RETURN _override;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.participant_members pm
    WHERE pm.participant_id = _participant_id
      AND (
        pm.user_id = _user_id
        OR lower(pm.email) = (SELECT lower(u.email) FROM auth.users u WHERE u.id = _user_id)
      )
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.can_edit_participant_budget(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_edit_participant_budget(uuid, uuid) TO authenticated;

-- Absolute locking on the child tables
DROP POLICY ls_personnel_roles_insert ON public.ls_personnel_roles;
DROP POLICY ls_personnel_roles_update ON public.ls_personnel_roles;
DROP POLICY ls_personnel_roles_delete ON public.ls_personnel_roles;

CREATE POLICY ls_personnel_roles_insert ON public.ls_personnel_roles
FOR INSERT TO authenticated WITH CHECK (
  public.can_edit_participant_budget(auth.uid(), participant_id)
  AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_personnel_roles.participant_id AND b.is_locked)
);
CREATE POLICY ls_personnel_roles_update ON public.ls_personnel_roles
FOR UPDATE TO authenticated USING (
  public.can_edit_participant_budget(auth.uid(), participant_id)
  AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_personnel_roles.participant_id AND b.is_locked)
) WITH CHECK (
  public.can_edit_participant_budget(auth.uid(), participant_id)
  AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_personnel_roles.participant_id AND b.is_locked)
);
CREATE POLICY ls_personnel_roles_delete ON public.ls_personnel_roles
FOR DELETE TO authenticated USING (
  public.can_edit_participant_budget(auth.uid(), participant_id)
  AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_personnel_roles.participant_id AND b.is_locked)
);

DROP POLICY ls_cost_items_insert ON public.ls_cost_items;
DROP POLICY ls_cost_items_update ON public.ls_cost_items;
DROP POLICY ls_cost_items_delete ON public.ls_cost_items;

CREATE POLICY ls_cost_items_insert ON public.ls_cost_items
FOR INSERT TO authenticated WITH CHECK (
  public.can_edit_participant_budget(auth.uid(), participant_id)
  AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_cost_items.participant_id AND b.is_locked)
);
CREATE POLICY ls_cost_items_update ON public.ls_cost_items
FOR UPDATE TO authenticated USING (
  public.can_edit_participant_budget(auth.uid(), participant_id)
  AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_cost_items.participant_id AND b.is_locked)
) WITH CHECK (
  public.can_edit_participant_budget(auth.uid(), participant_id)
  AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_cost_items.participant_id AND b.is_locked)
);
CREATE POLICY ls_cost_items_delete ON public.ls_cost_items
FOR DELETE TO authenticated USING (
  public.can_edit_participant_budget(auth.uid(), participant_id)
  AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_cost_items.participant_id AND b.is_locked)
);

DROP POLICY ls_depreciation_items_insert ON public.ls_depreciation_items;
DROP POLICY ls_depreciation_items_update ON public.ls_depreciation_items;
DROP POLICY ls_depreciation_items_delete ON public.ls_depreciation_items;

CREATE POLICY ls_depreciation_items_insert ON public.ls_depreciation_items
FOR INSERT TO authenticated WITH CHECK (
  public.can_edit_participant_budget(auth.uid(), participant_id)
  AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_depreciation_items.participant_id AND b.is_locked)
);
CREATE POLICY ls_depreciation_items_update ON public.ls_depreciation_items
FOR UPDATE TO authenticated USING (
  public.can_edit_participant_budget(auth.uid(), participant_id)
  AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_depreciation_items.participant_id AND b.is_locked)
) WITH CHECK (
  public.can_edit_participant_budget(auth.uid(), participant_id)
  AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_depreciation_items.participant_id AND b.is_locked)
);
CREATE POLICY ls_depreciation_items_delete ON public.ls_depreciation_items
FOR DELETE TO authenticated USING (
  public.can_edit_participant_budget(auth.uid(), participant_id)
  AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_depreciation_items.participant_id AND b.is_locked)
);

DROP POLICY ls_wp_budget_insert ON public.ls_wp_budget;
DROP POLICY ls_wp_budget_update ON public.ls_wp_budget;
DROP POLICY ls_wp_budget_delete ON public.ls_wp_budget;

CREATE POLICY ls_wp_budget_insert ON public.ls_wp_budget
FOR INSERT TO authenticated WITH CHECK (
  public.can_edit_participant_budget(auth.uid(), participant_id)
  AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_wp_budget.participant_id AND b.is_locked)
);
CREATE POLICY ls_wp_budget_update ON public.ls_wp_budget
FOR UPDATE TO authenticated USING (
  public.can_edit_participant_budget(auth.uid(), participant_id)
  AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_wp_budget.participant_id AND b.is_locked)
) WITH CHECK (
  public.can_edit_participant_budget(auth.uid(), participant_id)
  AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_wp_budget.participant_id AND b.is_locked)
);
CREATE POLICY ls_wp_budget_delete ON public.ls_wp_budget
FOR DELETE TO authenticated USING (
  public.can_edit_participant_budget(auth.uid(), participant_id)
  AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_wp_budget.participant_id AND b.is_locked)
);

DROP POLICY ls_personnel_effort_insert ON public.ls_personnel_effort;
DROP POLICY ls_personnel_effort_update ON public.ls_personnel_effort;
DROP POLICY ls_personnel_effort_delete ON public.ls_personnel_effort;

CREATE POLICY ls_personnel_effort_insert ON public.ls_personnel_effort
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ls_personnel_roles r
    WHERE r.id = ls_personnel_effort.role_id
      AND public.can_edit_participant_budget(auth.uid(), r.participant_id)
      AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = r.participant_id AND b.is_locked)
  )
);
CREATE POLICY ls_personnel_effort_update ON public.ls_personnel_effort
FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.ls_personnel_roles r
    WHERE r.id = ls_personnel_effort.role_id
      AND public.can_edit_participant_budget(auth.uid(), r.participant_id)
      AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = r.participant_id AND b.is_locked)
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.ls_personnel_roles r
    WHERE r.id = ls_personnel_effort.role_id
      AND public.can_edit_participant_budget(auth.uid(), r.participant_id)
      AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = r.participant_id AND b.is_locked)
  )
);
CREATE POLICY ls_personnel_effort_delete ON public.ls_personnel_effort
FOR DELETE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public.ls_personnel_roles r
    WHERE r.id = ls_personnel_effort.role_id
      AND public.can_edit_participant_budget(auth.uid(), r.participant_id)
      AND NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = r.participant_id AND b.is_locked)
  )
);

-- ls_participant_budget itself
DROP POLICY ls_participant_budget_insert ON public.ls_participant_budget;
DROP POLICY ls_participant_budget_update ON public.ls_participant_budget;
DROP POLICY ls_participant_budget_delete ON public.ls_participant_budget;

CREATE POLICY ls_participant_budget_insert ON public.ls_participant_budget
FOR INSERT TO authenticated WITH CHECK (
  public.can_edit_participant_budget(auth.uid(), participant_id)
  AND NOT is_locked
);
CREATE POLICY ls_participant_budget_update ON public.ls_participant_budget
FOR UPDATE TO authenticated USING (
  public.is_proposal_admin(auth.uid(), proposal_id)
  OR (public.can_edit_participant_budget(auth.uid(), participant_id) AND NOT is_locked)
) WITH CHECK (
  public.is_proposal_admin(auth.uid(), proposal_id)
  OR (public.can_edit_participant_budget(auth.uid(), participant_id) AND NOT is_locked)
);
CREATE POLICY ls_participant_budget_delete ON public.ls_participant_budget
FOR DELETE TO authenticated USING (public.is_proposal_admin(auth.uid(), proposal_id));

CREATE OR REPLACE FUNCTION public.ls_participant_budget_lock_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF (NEW.is_locked IS DISTINCT FROM OLD.is_locked
      OR NEW.locked_by IS DISTINCT FROM OLD.locked_by
      OR NEW.locked_at IS DISTINCT FROM OLD.locked_at)
     AND auth.uid() IS NOT NULL
     AND NOT public.is_proposal_admin(auth.uid(), NEW.proposal_id) THEN
    RAISE EXCEPTION 'Only coordinators and above may lock or unlock a participant budget';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS ls_participant_budget_lock_guard_trg ON public.ls_participant_budget;
CREATE TRIGGER ls_participant_budget_lock_guard_trg
BEFORE UPDATE ON public.ls_participant_budget
FOR EACH ROW EXECUTE FUNCTION public.ls_participant_budget_lock_guard();