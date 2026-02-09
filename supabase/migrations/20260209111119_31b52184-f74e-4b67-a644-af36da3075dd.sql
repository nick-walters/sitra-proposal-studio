
ALTER TABLE public.ethics_assessment
  ADD COLUMN IF NOT EXISTS security_euci_non_eu_access boolean DEFAULT null,
  ADD COLUMN IF NOT EXISTS security_euci_non_eu_access_page text DEFAULT null,
  ADD COLUMN IF NOT EXISTS security_euci_non_eu_agreement boolean DEFAULT null,
  ADD COLUMN IF NOT EXISTS security_euci_non_eu_agreement_page text DEFAULT null;
