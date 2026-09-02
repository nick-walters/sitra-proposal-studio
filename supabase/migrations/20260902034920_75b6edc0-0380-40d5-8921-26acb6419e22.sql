ALTER TABLE public.ls_cost_items
  ADD COLUMN quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  ADD COLUMN unit_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0);

ALTER TABLE public.ls_cost_items DROP COLUMN amount;

ALTER TABLE public.ls_cost_items
  ADD COLUMN amount numeric(14,2) GENERATED ALWAYS AS (round(quantity * unit_cost, 2)) STORED;

ALTER TABLE public.proposals
  ADD COLUMN ls_indirect_cost_rate numeric(5,2) NOT NULL DEFAULT 25.00,
  ADD COLUMN ls_default_funding_rate numeric(5,2) NOT NULL DEFAULT 100.00;