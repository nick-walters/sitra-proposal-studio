ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS traditional_budget_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lump_sum_budget_locked boolean NOT NULL DEFAULT false;