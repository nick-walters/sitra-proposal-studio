
-- ============================================================
-- 1. proposal_milestones
-- ============================================================
CREATE TABLE public.proposal_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  number integer NOT NULL DEFAULT 1,
  title text,
  due_month integer,
  means_of_verification text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_proposal_milestones_proposal ON public.proposal_milestones(proposal_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_milestones TO authenticated;
GRANT ALL ON public.proposal_milestones TO service_role;

ALTER TABLE public.proposal_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Proposal milestones viewable by proposal members"
  ON public.proposal_milestones FOR SELECT
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Proposal milestones insertable by editors"
  ON public.proposal_milestones FOR INSERT
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Proposal milestones updatable by editors"
  ON public.proposal_milestones FOR UPDATE
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Proposal milestones deletable by editors"
  ON public.proposal_milestones FOR DELETE
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE TRIGGER update_proposal_milestones_updated_at
  BEFORE UPDATE ON public.proposal_milestones
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2. proposal_milestone_wps (link)
-- ============================================================
CREATE TABLE public.proposal_milestone_wps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES public.proposal_milestones(id) ON DELETE CASCADE,
  wp_draft_id uuid NOT NULL REFERENCES public.wp_drafts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (milestone_id, wp_draft_id)
);
CREATE INDEX idx_proposal_milestone_wps_ms ON public.proposal_milestone_wps(milestone_id);
CREATE INDEX idx_proposal_milestone_wps_wp ON public.proposal_milestone_wps(wp_draft_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_milestone_wps TO authenticated;
GRANT ALL ON public.proposal_milestone_wps TO service_role;

ALTER TABLE public.proposal_milestone_wps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Milestone WPs viewable by proposal members"
  ON public.proposal_milestone_wps FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.proposal_milestones pm
    WHERE pm.id = milestone_id AND public.has_any_proposal_role(auth.uid(), pm.proposal_id)
  ));

CREATE POLICY "Milestone WPs insertable by editors"
  ON public.proposal_milestone_wps FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.proposal_milestones pm
    WHERE pm.id = milestone_id AND public.can_edit_proposal(auth.uid(), pm.proposal_id)
  ));

CREATE POLICY "Milestone WPs updatable by editors"
  ON public.proposal_milestone_wps FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.proposal_milestones pm
    WHERE pm.id = milestone_id AND public.can_edit_proposal(auth.uid(), pm.proposal_id)
  ));

CREATE POLICY "Milestone WPs deletable by editors"
  ON public.proposal_milestone_wps FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.proposal_milestones pm
    WHERE pm.id = milestone_id AND public.can_edit_proposal(auth.uid(), pm.proposal_id)
  ));

-- ============================================================
-- 3. proposal_milestone_tasks (link, for future Gantt)
-- ============================================================
CREATE TABLE public.proposal_milestone_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  milestone_id uuid NOT NULL REFERENCES public.proposal_milestones(id) ON DELETE CASCADE,
  wp_draft_task_id uuid NOT NULL REFERENCES public.wp_draft_tasks(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (milestone_id, wp_draft_task_id)
);
CREATE INDEX idx_proposal_milestone_tasks_ms ON public.proposal_milestone_tasks(milestone_id);
CREATE INDEX idx_proposal_milestone_tasks_task ON public.proposal_milestone_tasks(wp_draft_task_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_milestone_tasks TO authenticated;
GRANT ALL ON public.proposal_milestone_tasks TO service_role;

ALTER TABLE public.proposal_milestone_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Milestone tasks viewable by proposal members"
  ON public.proposal_milestone_tasks FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.proposal_milestones pm
    WHERE pm.id = milestone_id AND public.has_any_proposal_role(auth.uid(), pm.proposal_id)
  ));

CREATE POLICY "Milestone tasks insertable by editors"
  ON public.proposal_milestone_tasks FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.proposal_milestones pm
    WHERE pm.id = milestone_id AND public.can_edit_proposal(auth.uid(), pm.proposal_id)
  ));

CREATE POLICY "Milestone tasks updatable by editors"
  ON public.proposal_milestone_tasks FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.proposal_milestones pm
    WHERE pm.id = milestone_id AND public.can_edit_proposal(auth.uid(), pm.proposal_id)
  ));

CREATE POLICY "Milestone tasks deletable by editors"
  ON public.proposal_milestone_tasks FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.proposal_milestones pm
    WHERE pm.id = milestone_id AND public.can_edit_proposal(auth.uid(), pm.proposal_id)
  ));

-- ============================================================
-- 4. proposal_risks
-- ============================================================
CREATE TABLE public.proposal_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  number integer NOT NULL DEFAULT 1,
  title text,
  likelihood text,
  severity text,
  mitigation text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_proposal_risks_proposal ON public.proposal_risks(proposal_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_risks TO authenticated;
GRANT ALL ON public.proposal_risks TO service_role;

ALTER TABLE public.proposal_risks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Proposal risks viewable by proposal members"
  ON public.proposal_risks FOR SELECT
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Proposal risks insertable by editors"
  ON public.proposal_risks FOR INSERT
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Proposal risks updatable by editors"
  ON public.proposal_risks FOR UPDATE
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Proposal risks deletable by editors"
  ON public.proposal_risks FOR DELETE
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE TRIGGER update_proposal_risks_updated_at
  BEFORE UPDATE ON public.proposal_risks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5. proposal_risk_wps (link)
-- ============================================================
CREATE TABLE public.proposal_risk_wps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id uuid NOT NULL REFERENCES public.proposal_risks(id) ON DELETE CASCADE,
  wp_draft_id uuid NOT NULL REFERENCES public.wp_drafts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (risk_id, wp_draft_id)
);
CREATE INDEX idx_proposal_risk_wps_risk ON public.proposal_risk_wps(risk_id);
CREATE INDEX idx_proposal_risk_wps_wp ON public.proposal_risk_wps(wp_draft_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_risk_wps TO authenticated;
GRANT ALL ON public.proposal_risk_wps TO service_role;

ALTER TABLE public.proposal_risk_wps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Risk WPs viewable by proposal members"
  ON public.proposal_risk_wps FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.proposal_risks pr
    WHERE pr.id = risk_id AND public.has_any_proposal_role(auth.uid(), pr.proposal_id)
  ));

CREATE POLICY "Risk WPs insertable by editors"
  ON public.proposal_risk_wps FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.proposal_risks pr
    WHERE pr.id = risk_id AND public.can_edit_proposal(auth.uid(), pr.proposal_id)
  ));

CREATE POLICY "Risk WPs updatable by editors"
  ON public.proposal_risk_wps FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.proposal_risks pr
    WHERE pr.id = risk_id AND public.can_edit_proposal(auth.uid(), pr.proposal_id)
  ));

CREATE POLICY "Risk WPs deletable by editors"
  ON public.proposal_risk_wps FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.proposal_risks pr
    WHERE pr.id = risk_id AND public.can_edit_proposal(auth.uid(), pr.proposal_id)
  ));

-- ============================================================
-- 6. DATA MIGRATION — copy existing milestones/risks
-- ============================================================

-- Milestones: copy and preserve the original id for code that still uses it.
INSERT INTO public.proposal_milestones (id, proposal_id, number, title, due_month, means_of_verification, order_index, created_at, updated_at)
SELECT m.id, wd.proposal_id, m.number, m.title, m.due_month, m.means_of_verification, m.order_index, m.created_at, m.updated_at
FROM public.wp_draft_milestones m
JOIN public.wp_drafts wd ON wd.id = m.wp_draft_id
ON CONFLICT (id) DO NOTHING;

-- Milestone → WP links: originating wp_draft_id UNION parsed related_wps numbers.
WITH src AS (
  SELECT m.id AS ms_id, m.wp_draft_id AS origin_wp, wd.proposal_id, m.related_wps
  FROM public.wp_draft_milestones m
  JOIN public.wp_drafts wd ON wd.id = m.wp_draft_id
),
origin_links AS (
  SELECT ms_id, origin_wp AS wp_draft_id FROM src
),
parsed_nums AS (
  SELECT s.ms_id, s.proposal_id,
         NULLIF(regexp_replace(token, '[^0-9]', '', 'g'), '')::int AS wp_num
  FROM src s,
       LATERAL regexp_split_to_table(COALESCE(s.related_wps, ''), '[,;\s]+') AS token
  WHERE token <> ''
),
parsed_links AS (
  SELECT pn.ms_id, wd.id AS wp_draft_id
  FROM parsed_nums pn
  JOIN public.wp_drafts wd ON wd.proposal_id = pn.proposal_id AND wd.number = pn.wp_num
  WHERE pn.wp_num IS NOT NULL
),
all_links AS (
  SELECT * FROM origin_links
  UNION
  SELECT * FROM parsed_links
)
INSERT INTO public.proposal_milestone_wps (milestone_id, wp_draft_id)
SELECT ms_id, wp_draft_id FROM all_links
ON CONFLICT (milestone_id, wp_draft_id) DO NOTHING;

-- Risks: copy preserving id.
INSERT INTO public.proposal_risks (id, proposal_id, number, title, likelihood, severity, mitigation, order_index, created_at, updated_at)
SELECT r.id, wd.proposal_id, r.number, r.title, r.likelihood, r.severity, r.mitigation, r.order_index, r.created_at, r.updated_at
FROM public.wp_draft_risks r
JOIN public.wp_drafts wd ON wd.id = r.wp_draft_id
ON CONFLICT (id) DO NOTHING;

-- Risk → WP links: originating wp_draft_id UNION parsed related_wps numbers.
WITH src AS (
  SELECT r.id AS risk_id, r.wp_draft_id AS origin_wp, wd.proposal_id, r.related_wps
  FROM public.wp_draft_risks r
  JOIN public.wp_drafts wd ON wd.id = r.wp_draft_id
),
origin_links AS (
  SELECT risk_id, origin_wp AS wp_draft_id FROM src
),
parsed_nums AS (
  SELECT s.risk_id, s.proposal_id,
         NULLIF(regexp_replace(token, '[^0-9]', '', 'g'), '')::int AS wp_num
  FROM src s,
       LATERAL regexp_split_to_table(COALESCE(s.related_wps, ''), '[,;\s]+') AS token
  WHERE token <> ''
),
parsed_links AS (
  SELECT pn.risk_id, wd.id AS wp_draft_id
  FROM parsed_nums pn
  JOIN public.wp_drafts wd ON wd.proposal_id = pn.proposal_id AND wd.number = pn.wp_num
  WHERE pn.wp_num IS NOT NULL
),
all_links AS (
  SELECT * FROM origin_links
  UNION
  SELECT * FROM parsed_links
)
INSERT INTO public.proposal_risk_wps (risk_id, wp_draft_id)
SELECT risk_id, wp_draft_id FROM all_links
ON CONFLICT (risk_id, wp_draft_id) DO NOTHING;
