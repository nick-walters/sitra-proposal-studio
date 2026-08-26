CREATE TABLE public.table_column_headers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  table_key text NOT NULL,
  headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (proposal_id, table_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.table_column_headers TO authenticated;
GRANT ALL ON public.table_column_headers TO service_role;

ALTER TABLE public.table_column_headers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view column headers for their proposals"
ON public.table_column_headers FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM user_roles ur
  WHERE ur.user_id = auth.uid()
    AND (ur.proposal_id = table_column_headers.proposal_id OR ur.proposal_id IS NULL)
));

CREATE POLICY "Coordinators can insert column headers"
ON public.table_column_headers FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM user_roles ur
  WHERE ur.user_id = auth.uid()
    AND (((ur.proposal_id IS NULL) AND ur.role = ANY (ARRAY['owner'::app_role,'admin'::app_role]))
      OR (ur.proposal_id = table_column_headers.proposal_id AND ur.role = 'coordinator'::app_role))
));

CREATE POLICY "Coordinators can update column headers"
ON public.table_column_headers FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM user_roles ur
  WHERE ur.user_id = auth.uid()
    AND (((ur.proposal_id IS NULL) AND ur.role = ANY (ARRAY['owner'::app_role,'admin'::app_role]))
      OR (ur.proposal_id = table_column_headers.proposal_id AND ur.role = 'coordinator'::app_role))
));