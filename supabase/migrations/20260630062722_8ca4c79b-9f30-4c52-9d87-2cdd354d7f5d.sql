ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS b31_show_purchase_costs boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS b31_show_other_direct_costs boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS b31_show_equipment_justification boolean NOT NULL DEFAULT false;