ALTER TABLE public.participant_descriptions
  ADD COLUMN IF NOT EXISTS value_chain_applicable boolean;

COMMENT ON COLUMN public.participant_descriptions.value_chain_applicable IS
  'Explicit Yes/No answer to "does this participant bring value chain coverage?". NULL = never answered; the app derives Yes for SME/LE or where value_chain text already exists, otherwise No.';