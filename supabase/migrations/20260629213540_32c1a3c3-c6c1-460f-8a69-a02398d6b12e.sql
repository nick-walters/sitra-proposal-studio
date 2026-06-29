
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS b31_show_travel_justification boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS b31_show_other_goods_justification boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS b31_show_fstp_justification boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS b31_show_internally_invoiced_justification boolean NOT NULL DEFAULT false;
