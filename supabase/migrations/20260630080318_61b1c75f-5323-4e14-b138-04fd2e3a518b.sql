
-- 1. Add proposals flag
ALTER TABLE public.proposals ADD COLUMN IF NOT EXISTS expertise_matrix_enabled boolean NOT NULL DEFAULT true;

-- 2. Rows table
CREATE TABLE public.expertise_matrix_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT '',
  order_index integer NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expertise_matrix_rows TO authenticated;
GRANT ALL ON public.expertise_matrix_rows TO service_role;
ALTER TABLE public.expertise_matrix_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View expertise rows for proposals with access" ON public.expertise_matrix_rows
  FOR SELECT USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Editors can insert expertise rows" ON public.expertise_matrix_rows
  FOR INSERT WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));
CREATE POLICY "Editors can update expertise rows" ON public.expertise_matrix_rows
  FOR UPDATE USING (public.can_edit_proposal(auth.uid(), proposal_id));
CREATE POLICY "Editors can delete expertise rows" ON public.expertise_matrix_rows
  FOR DELETE USING (public.can_edit_proposal(auth.uid(), proposal_id));
CREATE INDEX idx_expertise_matrix_rows_proposal ON public.expertise_matrix_rows(proposal_id, order_index);

-- 3. Columns table
CREATE TABLE public.expertise_matrix_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('participant','custom')),
  participant_id uuid NULL REFERENCES public.participants(id) ON DELETE CASCADE,
  header_text text NULL,
  order_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX expertise_matrix_columns_participant_uniq
  ON public.expertise_matrix_columns(proposal_id, participant_id) WHERE kind = 'participant';
CREATE INDEX idx_expertise_matrix_columns_proposal ON public.expertise_matrix_columns(proposal_id, order_index);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expertise_matrix_columns TO authenticated;
GRANT ALL ON public.expertise_matrix_columns TO service_role;
ALTER TABLE public.expertise_matrix_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View expertise columns for proposals with access" ON public.expertise_matrix_columns
  FOR SELECT USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Editors can insert expertise columns" ON public.expertise_matrix_columns
  FOR INSERT WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));
CREATE POLICY "Editors can update expertise columns" ON public.expertise_matrix_columns
  FOR UPDATE USING (public.can_edit_proposal(auth.uid(), proposal_id));
CREATE POLICY "Editors can delete expertise columns" ON public.expertise_matrix_columns
  FOR DELETE USING (public.can_edit_proposal(auth.uid(), proposal_id));

-- 4. Cells table
CREATE TABLE public.expertise_matrix_cells (
  row_id uuid NOT NULL REFERENCES public.expertise_matrix_rows(id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES public.expertise_matrix_columns(id) ON DELETE CASCADE,
  checked boolean NOT NULL DEFAULT false,
  PRIMARY KEY (row_id, column_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expertise_matrix_cells TO authenticated;
GRANT ALL ON public.expertise_matrix_cells TO service_role;
ALTER TABLE public.expertise_matrix_cells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View expertise cells for proposals with access" ON public.expertise_matrix_cells
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.expertise_matrix_rows r
    WHERE r.id = expertise_matrix_cells.row_id AND public.has_any_proposal_role(auth.uid(), r.proposal_id)
  ));
CREATE POLICY "Editors can insert expertise cells" ON public.expertise_matrix_cells
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM public.expertise_matrix_rows r
    WHERE r.id = expertise_matrix_cells.row_id AND public.can_edit_proposal(auth.uid(), r.proposal_id)
  ));
CREATE POLICY "Editors can update expertise cells" ON public.expertise_matrix_cells
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM public.expertise_matrix_rows r
    WHERE r.id = expertise_matrix_cells.row_id AND public.can_edit_proposal(auth.uid(), r.proposal_id)
  ));
CREATE POLICY "Editors can delete expertise cells" ON public.expertise_matrix_cells
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM public.expertise_matrix_rows r
    WHERE r.id = expertise_matrix_cells.row_id AND public.can_edit_proposal(auth.uid(), r.proposal_id)
  ));
