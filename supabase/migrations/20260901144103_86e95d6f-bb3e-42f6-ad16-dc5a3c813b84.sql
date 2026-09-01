-- Column on proposals
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS lump_sum_budget_active boolean NOT NULL DEFAULT false;

-- 1. ls_personnel_roles
CREATE TABLE public.ls_personnel_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  cost_line text NOT NULL CHECK (cost_line IN ('A.1','A.2','A.3','A.4')),
  role_name text NOT NULL DEFAULT '',
  he_category text NULL CHECK (he_category IS NULL OR he_category IN ('senior_scientist','junior_scientist','technical','administrative','others')),
  pm_rate numeric(14,2) NOT NULL DEFAULT 0,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. ls_personnel_effort
CREATE TABLE public.ls_personnel_effort (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.ls_personnel_roles(id) ON DELETE CASCADE,
  wp_draft_id uuid NOT NULL REFERENCES public.wp_drafts(id) ON DELETE CASCADE,
  person_months numeric(6,1) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role_id, wp_draft_id)
);

-- 3. ls_cost_items
CREATE TABLE public.ls_cost_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  wp_draft_id uuid NOT NULL REFERENCES public.wp_drafts(id) ON DELETE CASCADE,
  cost_line text NOT NULL CHECK (cost_line IN ('B.1','C.1','C.2.infrastructure','C.2.equipment','C.2.other_assets','C.3.consumables','C.3.meetings','C.3.dissemination','C.3.publication','C.3.other','D.1','D.2')),
  amount numeric(14,2) NOT NULL DEFAULT 0,
  justification text NOT NULL DEFAULT '',
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. ls_depreciation_items
CREATE TABLE public.ls_depreciation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  wp_draft_id uuid NOT NULL REFERENCES public.wp_drafts(id) ON DELETE CASCADE,
  resource_type text NOT NULL DEFAULT 'equipment' CHECK (resource_type IN ('equipment','infrastructure','other_assets')),
  short_name text NOT NULL DEFAULT '',
  purchase_date date NULL,
  purchase_cost numeric(14,2) NOT NULL DEFAULT 0,
  pct_project numeric(5,2) NOT NULL DEFAULT 100 CHECK (pct_project >= 0 AND pct_project <= 100),
  pct_useful_life numeric(5,2) NOT NULL DEFAULT 100 CHECK (pct_useful_life >= 0 AND pct_useful_life <= 100),
  comments text NULL CHECK (comments IS NULL OR char_length(comments) <= 100),
  include_in_c2 boolean NOT NULL DEFAULT true,
  order_index integer NOT NULL DEFAULT 0,
  charged_depreciation numeric(14,2) GENERATED ALWAYS AS (round(purchase_cost * (pct_project/100) * (pct_useful_life/100), 2)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 5. ls_participant_budget
CREATE TABLE public.ls_participant_budget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL UNIQUE REFERENCES public.participants(id) ON DELETE CASCADE,
  a4_unit_cost numeric(14,2) NULL,
  funding_rate_override numeric(5,2) NULL,
  is_locked boolean NOT NULL DEFAULT false,
  locked_by uuid NULL,
  locked_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. ls_wp_budget
CREATE TABLE public.ls_wp_budget (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  wp_draft_id uuid NOT NULL REFERENCES public.wp_drafts(id) ON DELETE CASCADE,
  comments text NOT NULL DEFAULT '',
  requested_eu_contribution numeric(14,2) NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (participant_id, wp_draft_id)
);

-- GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ls_personnel_roles TO authenticated;
GRANT ALL ON public.ls_personnel_roles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ls_personnel_effort TO authenticated;
GRANT ALL ON public.ls_personnel_effort TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ls_cost_items TO authenticated;
GRANT ALL ON public.ls_cost_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ls_depreciation_items TO authenticated;
GRANT ALL ON public.ls_depreciation_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ls_participant_budget TO authenticated;
GRANT ALL ON public.ls_participant_budget TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ls_wp_budget TO authenticated;
GRANT ALL ON public.ls_wp_budget TO service_role;

-- INDEXES
CREATE INDEX idx_ls_personnel_roles_proposal ON public.ls_personnel_roles(proposal_id);
CREATE INDEX idx_ls_personnel_effort_proposal ON public.ls_personnel_effort(proposal_id);
CREATE INDEX idx_ls_cost_items_proposal ON public.ls_cost_items(proposal_id);
CREATE INDEX idx_ls_depreciation_items_proposal ON public.ls_depreciation_items(proposal_id);
CREATE INDEX idx_ls_participant_budget_proposal ON public.ls_participant_budget(proposal_id);
CREATE INDEX idx_ls_wp_budget_proposal ON public.ls_wp_budget(proposal_id);
CREATE INDEX idx_ls_personnel_roles_participant_line ON public.ls_personnel_roles(participant_id, cost_line, order_index);
CREATE INDEX idx_ls_personnel_effort_wp ON public.ls_personnel_effort(wp_draft_id);
CREATE INDEX idx_ls_cost_items_part_wp_line ON public.ls_cost_items(participant_id, wp_draft_id, cost_line);
CREATE INDEX idx_ls_depreciation_items_part_wp ON public.ls_depreciation_items(participant_id, wp_draft_id);

-- updated_at triggers
CREATE TRIGGER update_ls_personnel_roles_updated_at BEFORE UPDATE ON public.ls_personnel_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ls_personnel_effort_updated_at BEFORE UPDATE ON public.ls_personnel_effort FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ls_cost_items_updated_at BEFORE UPDATE ON public.ls_cost_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ls_depreciation_items_updated_at BEFORE UPDATE ON public.ls_depreciation_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ls_participant_budget_updated_at BEFORE UPDATE ON public.ls_participant_budget FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ls_wp_budget_updated_at BEFORE UPDATE ON public.ls_wp_budget FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- PERMISSION FUNCTION
CREATE OR REPLACE FUNCTION public.can_edit_participant_budget(_user_id uuid, _participant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.participants p
    WHERE p.id = _participant_id
      AND (
        public.is_proposal_admin(_user_id, p.proposal_id)
        OR (
          public.has_any_proposal_role(_user_id, p.proposal_id)
          AND EXISTS (
            SELECT 1
            FROM public.participant_members pm
            WHERE pm.participant_id = _participant_id
              AND (
                pm.user_id = _user_id
                OR lower(pm.email) = (SELECT lower(u.email) FROM auth.users u WHERE u.id = _user_id)
              )
          )
        )
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_edit_participant_budget(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_edit_participant_budget(uuid, uuid) TO authenticated;

-- Helper for lock check (inline expressions below use it via subquery)

-- RLS
ALTER TABLE public.ls_personnel_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ls_personnel_effort ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ls_cost_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ls_depreciation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ls_participant_budget ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ls_wp_budget ENABLE ROW LEVEL SECURITY;

-- ls_personnel_roles
CREATE POLICY "ls_personnel_roles_select" ON public.ls_personnel_roles FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "ls_personnel_roles_insert" ON public.ls_personnel_roles FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_personnel_roles.participant_id AND b.is_locked)));
CREATE POLICY "ls_personnel_roles_update" ON public.ls_personnel_roles FOR UPDATE TO authenticated
  USING (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_personnel_roles.participant_id AND b.is_locked)))
  WITH CHECK (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_personnel_roles.participant_id AND b.is_locked)));
CREATE POLICY "ls_personnel_roles_delete" ON public.ls_personnel_roles FOR DELETE TO authenticated
  USING (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_personnel_roles.participant_id AND b.is_locked)));

-- ls_personnel_effort (participant resolved via role)
CREATE POLICY "ls_personnel_effort_select" ON public.ls_personnel_effort FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "ls_personnel_effort_insert" ON public.ls_personnel_effort FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.ls_personnel_roles r WHERE r.id = ls_personnel_effort.role_id
    AND public.can_edit_participant_budget(auth.uid(), r.participant_id)
    AND (public.is_proposal_admin(auth.uid(), ls_personnel_effort.proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = r.participant_id AND b.is_locked))));
CREATE POLICY "ls_personnel_effort_update" ON public.ls_personnel_effort FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ls_personnel_roles r WHERE r.id = ls_personnel_effort.role_id
    AND public.can_edit_participant_budget(auth.uid(), r.participant_id)
    AND (public.is_proposal_admin(auth.uid(), ls_personnel_effort.proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = r.participant_id AND b.is_locked))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ls_personnel_roles r WHERE r.id = ls_personnel_effort.role_id
    AND public.can_edit_participant_budget(auth.uid(), r.participant_id)
    AND (public.is_proposal_admin(auth.uid(), ls_personnel_effort.proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = r.participant_id AND b.is_locked))));
CREATE POLICY "ls_personnel_effort_delete" ON public.ls_personnel_effort FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.ls_personnel_roles r WHERE r.id = ls_personnel_effort.role_id
    AND public.can_edit_participant_budget(auth.uid(), r.participant_id)
    AND (public.is_proposal_admin(auth.uid(), ls_personnel_effort.proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = r.participant_id AND b.is_locked))));

-- ls_cost_items
CREATE POLICY "ls_cost_items_select" ON public.ls_cost_items FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "ls_cost_items_insert" ON public.ls_cost_items FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_cost_items.participant_id AND b.is_locked)));
CREATE POLICY "ls_cost_items_update" ON public.ls_cost_items FOR UPDATE TO authenticated
  USING (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_cost_items.participant_id AND b.is_locked)))
  WITH CHECK (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_cost_items.participant_id AND b.is_locked)));
CREATE POLICY "ls_cost_items_delete" ON public.ls_cost_items FOR DELETE TO authenticated
  USING (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_cost_items.participant_id AND b.is_locked)));

-- ls_depreciation_items
CREATE POLICY "ls_depreciation_items_select" ON public.ls_depreciation_items FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "ls_depreciation_items_insert" ON public.ls_depreciation_items FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_depreciation_items.participant_id AND b.is_locked)));
CREATE POLICY "ls_depreciation_items_update" ON public.ls_depreciation_items FOR UPDATE TO authenticated
  USING (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_depreciation_items.participant_id AND b.is_locked)))
  WITH CHECK (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_depreciation_items.participant_id AND b.is_locked)));
CREATE POLICY "ls_depreciation_items_delete" ON public.ls_depreciation_items FOR DELETE TO authenticated
  USING (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_depreciation_items.participant_id AND b.is_locked)));

-- ls_participant_budget (admins may always change, so lock can be released)
CREATE POLICY "ls_participant_budget_select" ON public.ls_participant_budget FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "ls_participant_budget_insert" ON public.ls_participant_budget FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_participant_budget(auth.uid(), participant_id));
CREATE POLICY "ls_participant_budget_update" ON public.ls_participant_budget FOR UPDATE TO authenticated
  USING (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id) OR NOT is_locked))
  WITH CHECK (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id) OR NOT is_locked));
CREATE POLICY "ls_participant_budget_delete" ON public.ls_participant_budget FOR DELETE TO authenticated
  USING (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id) OR NOT is_locked));

-- ls_wp_budget
CREATE POLICY "ls_wp_budget_select" ON public.ls_wp_budget FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "ls_wp_budget_insert" ON public.ls_wp_budget FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_wp_budget.participant_id AND b.is_locked)));
CREATE POLICY "ls_wp_budget_update" ON public.ls_wp_budget FOR UPDATE TO authenticated
  USING (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_wp_budget.participant_id AND b.is_locked)))
  WITH CHECK (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_wp_budget.participant_id AND b.is_locked)));
CREATE POLICY "ls_wp_budget_delete" ON public.ls_wp_budget FOR DELETE TO authenticated
  USING (public.can_edit_participant_budget(auth.uid(), participant_id)
    AND (public.is_proposal_admin(auth.uid(), proposal_id)
      OR NOT EXISTS (SELECT 1 FROM public.ls_participant_budget b WHERE b.participant_id = ls_wp_budget.participant_id AND b.is_locked)));