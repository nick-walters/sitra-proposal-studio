ALTER TABLE public.methodology_linked_activities
  DROP CONSTRAINT IF EXISTS methodology_linked_activities_instrument_code_check;

ALTER TABLE public.methodology_linked_activities
  ADD CONSTRAINT methodology_linked_activities_instrument_code_check
  CHECK (instrument_code IN ('HE','DEU','RCF','NCM','EU4H','OTHER'));