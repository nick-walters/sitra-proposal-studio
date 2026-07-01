ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS mirror_contribution_resources boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mirror_infrastructure boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mirror_value_chain boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mirror_industrial_involvement boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS mirror_participation_justification boolean NOT NULL DEFAULT true;