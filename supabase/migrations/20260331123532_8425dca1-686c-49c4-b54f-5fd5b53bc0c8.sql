
ALTER TABLE public.budget_rows
  ADD COLUMN has_in_kind boolean NOT NULL DEFAULT false,
  ADD COLUMN requested_personnel_costs numeric DEFAULT NULL,
  ADD COLUMN requested_subcontracting numeric DEFAULT NULL,
  ADD COLUMN requested_travel numeric DEFAULT NULL,
  ADD COLUMN requested_equipment numeric DEFAULT NULL,
  ADD COLUMN requested_other_goods numeric DEFAULT NULL,
  ADD COLUMN requested_fstp numeric DEFAULT NULL,
  ADD COLUMN requested_internally_invoiced numeric DEFAULT NULL,
  ADD COLUMN requested_indirect_costs numeric DEFAULT NULL;
