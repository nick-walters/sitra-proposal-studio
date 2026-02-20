
ALTER TABLE public.proposals 
  ADD COLUMN IF NOT EXISTS indicative_budget_per_project text,
  ADD COLUMN IF NOT EXISTS fstp_budget text,
  ADD COLUMN IF NOT EXISTS fstp_budget_per_third_party text;

-- Also change expected_projects to text if not already (it already is text, so no change needed)
