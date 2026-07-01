-- Stage 4 Part A: per-case-type include_number / include_abbreviation flags.
ALTER TABLE public.proposal_case_types
  ADD COLUMN IF NOT EXISTS include_number boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS include_abbreviation boolean NOT NULL DEFAULT true;

-- Backfill from the old proposal-wide flags on proposals so existing
-- behaviour is preserved across every proposal.
UPDATE public.proposal_case_types pct
SET
  include_number = COALESCE(p.case_include_number, true),
  include_abbreviation = COALESCE(p.case_include_abbreviation, true)
FROM public.proposals p
WHERE pct.proposal_id = p.id;