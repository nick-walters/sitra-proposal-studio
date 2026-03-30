ALTER TABLE public.budget_rows 
  ADD COLUMN financial_support_third_parties numeric DEFAULT 0 NOT NULL,
  ADD COLUMN procurement numeric DEFAULT 0 NOT NULL;