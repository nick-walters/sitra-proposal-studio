ALTER TABLE public.proposals
ADD COLUMN IF NOT EXISTS b31_show_all_equipment_justification boolean NOT NULL DEFAULT false;