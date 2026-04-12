-- Modify b12_ongoing_projects: drop unused columns, rename remaining
ALTER TABLE public.b12_ongoing_projects
  DROP COLUMN IF EXISTS funding_programme,
  DROP COLUMN IF EXISTS period,
  DROP COLUMN IF EXISTS coordinator;

ALTER TABLE public.b12_ongoing_projects
  RENAME COLUMN relation TO shared_data;

ALTER TABLE public.b12_ongoing_projects
  RENAME COLUMN acronym_name TO project_info;

-- Junction table for participant links
CREATE TABLE public.b12_ongoing_project_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ongoing_project_id uuid REFERENCES public.b12_ongoing_projects(id) ON DELETE CASCADE NOT NULL,
  participant_id uuid REFERENCES public.participants(id) ON DELETE CASCADE NOT NULL,
  UNIQUE (ongoing_project_id, participant_id)
);

ALTER TABLE public.b12_ongoing_project_participants ENABLE ROW LEVEL SECURITY;

-- RLS via the parent ongoing_project row's proposal_id
CREATE POLICY "Users with proposal role can select"
  ON public.b12_ongoing_project_participants FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.b12_ongoing_projects op
      WHERE op.id = ongoing_project_id
        AND public.has_any_proposal_role(auth.uid(), op.proposal_id)
    )
  );

CREATE POLICY "Users who can edit can insert"
  ON public.b12_ongoing_project_participants FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.b12_ongoing_projects op
      WHERE op.id = ongoing_project_id
        AND public.can_edit_proposal(auth.uid(), op.proposal_id)
    )
  );

CREATE POLICY "Users who can edit can update"
  ON public.b12_ongoing_project_participants FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.b12_ongoing_projects op
      WHERE op.id = ongoing_project_id
        AND public.can_edit_proposal(auth.uid(), op.proposal_id)
    )
  );

CREATE POLICY "Users who can edit can delete"
  ON public.b12_ongoing_project_participants FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.b12_ongoing_projects op
      WHERE op.id = ongoing_project_id
        AND public.can_edit_proposal(auth.uid(), op.proposal_id)
    )
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.b12_ongoing_project_participants;