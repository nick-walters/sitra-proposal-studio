-- ============ card_table ============
CREATE TABLE public.card_table (
  card_id uuid PRIMARY KEY REFERENCES public.proposal_cards(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  caption text,
  caption_suffix char(1),
  variant text NOT NULL DEFAULT 'standard'
    CHECK (variant IN ('standard','cases','wp_description')),
  parts smallint NOT NULL DEFAULT 1 CHECK (parts >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.card_table TO authenticated;
GRANT ALL ON public.card_table TO service_role;
ALTER TABLE public.card_table ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view card tables" ON public.card_table
  FOR SELECT TO authenticated USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Editors can insert card tables" ON public.card_table
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));
CREATE POLICY "Editors can update card tables" ON public.card_table
  FOR UPDATE TO authenticated USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

-- ============ card_table_columns ============
CREATE TABLE public.card_table_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.card_table(card_id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  part smallint NOT NULL DEFAULT 1,
  order_index integer NOT NULL,
  label_html text,
  width_px integer,
  align_h text CHECK (align_h IN ('left','center','right','justify')),
  align_v text CHECK (align_v IN ('top','middle','bottom')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_table_columns_slot_unique UNIQUE (card_id, part, order_index)
    DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX card_table_columns_card_idx ON public.card_table_columns (card_id, part, order_index);
GRANT SELECT, INSERT, UPDATE ON public.card_table_columns TO authenticated;
GRANT ALL ON public.card_table_columns TO service_role;
ALTER TABLE public.card_table_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view card table columns" ON public.card_table_columns
  FOR SELECT TO authenticated USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Editors can insert card table columns" ON public.card_table_columns
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));
CREATE POLICY "Editors can update card table columns" ON public.card_table_columns
  FOR UPDATE TO authenticated USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

-- ============ card_table_rows ============
CREATE TABLE public.card_table_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.card_table(card_id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  part smallint NOT NULL DEFAULT 1,
  order_index integer NOT NULL,
  row_type text NOT NULL CHECK (row_type IN ('header','body')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_table_rows_slot_unique UNIQUE (card_id, part, order_index)
    DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX card_table_rows_card_idx ON public.card_table_rows (card_id, part, order_index);
GRANT SELECT, INSERT, UPDATE ON public.card_table_rows TO authenticated;
GRANT ALL ON public.card_table_rows TO service_role;
ALTER TABLE public.card_table_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view card table rows" ON public.card_table_rows
  FOR SELECT TO authenticated USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Editors can insert card table rows" ON public.card_table_rows
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));
CREATE POLICY "Editors can update card table rows" ON public.card_table_rows
  FOR UPDATE TO authenticated USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

-- ============ card_table_cells ============
CREATE TABLE public.card_table_cells (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  row_id uuid NOT NULL REFERENCES public.card_table_rows(id) ON DELETE CASCADE,
  column_id uuid NOT NULL REFERENCES public.card_table_columns(id) ON DELETE CASCADE,
  content_html text,
  align_h text CHECK (align_h IN ('left','center','right','justify')),
  align_v text CHECK (align_v IN ('top','middle','bottom')),
  colspan integer NOT NULL DEFAULT 1 CHECK (colspan >= 1),
  rowspan integer NOT NULL DEFAULT 1 CHECK (rowspan >= 1),
  content_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT card_table_cells_slot_unique UNIQUE (row_id, column_id)
);
CREATE INDEX card_table_cells_row_idx ON public.card_table_cells (row_id);
CREATE INDEX card_table_cells_column_idx ON public.card_table_cells (column_id);
GRANT SELECT, INSERT, UPDATE ON public.card_table_cells TO authenticated;
GRANT ALL ON public.card_table_cells TO service_role;
ALTER TABLE public.card_table_cells ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view card table cells" ON public.card_table_cells
  FOR SELECT TO authenticated USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Editors can insert card table cells" ON public.card_table_cells
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));
CREATE POLICY "Editors can update card table cells" ON public.card_table_cells
  FOR UPDATE TO authenticated USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

-- ============ card_figure ============
CREATE TABLE public.card_figure (
  card_id uuid PRIMARY KEY REFERENCES public.proposal_cards(id) ON DELETE CASCADE,
  proposal_id uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  figure_id uuid REFERENCES public.figures(id) ON DELETE SET NULL,
  float text NOT NULL DEFAULT 'none' CHECK (float IN ('none','left','right')),
  max_width_cm numeric,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX card_figure_figure_idx ON public.card_figure (figure_id);
GRANT SELECT, INSERT, UPDATE ON public.card_figure TO authenticated;
GRANT ALL ON public.card_figure TO service_role;
ALTER TABLE public.card_figure ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view card figures" ON public.card_figure
  FOR SELECT TO authenticated USING (public.has_any_proposal_role(auth.uid(), proposal_id));
CREATE POLICY "Editors can insert card figures" ON public.card_figure
  FOR INSERT TO authenticated WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));
CREATE POLICY "Editors can update card figures" ON public.card_figure
  FOR UPDATE TO authenticated USING (public.can_edit_proposal(auth.uid(), proposal_id))
  WITH CHECK (public.can_edit_proposal(auth.uid(), proposal_id));

-- updated_at maintenance
CREATE TRIGGER card_table_updated_at BEFORE UPDATE ON public.card_table
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER card_table_columns_updated_at BEFORE UPDATE ON public.card_table_columns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER card_table_rows_updated_at BEFORE UPDATE ON public.card_table_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER card_table_cells_updated_at BEFORE UPDATE ON public.card_table_cells
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER card_figure_updated_at BEFORE UPDATE ON public.card_figure
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();