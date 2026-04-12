CREATE TABLE public.b12_ongoing_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid REFERENCES public.proposals(id) ON DELETE CASCADE NOT NULL,
  acronym_name text DEFAULT '',
  funding_programme text DEFAULT '',
  period text DEFAULT '',
  coordinator text DEFAULT '',
  relation text DEFAULT '',
  order_index integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.b12_ongoing_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users with proposal role can select"
  ON public.b12_ongoing_projects FOR SELECT TO authenticated
  USING (public.has_any_proposal_role(auth.uid(), proposal_id));

CREATE POLICY "Users who can edit can insert"
  ON public.b12_ongoing_projects FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Users who can edit can update"
  ON public.b12_ongoing_projects FOR UPDATE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE POLICY "Users who can edit can delete"
  ON public.b12_ongoing_projects FOR DELETE TO authenticated
  USING (public.can_edit_proposal(auth.uid(), proposal_id));

CREATE TRIGGER update_b12_ongoing_projects_updated_at
  BEFORE UPDATE ON public.b12_ongoing_projects
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.b12_ongoing_projects;