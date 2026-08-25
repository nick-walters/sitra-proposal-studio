-- The A2 checkbox migration backfilled block visibility from an OR of the two
-- underlying booleans, but never reconciled the booleans back to the block.
-- A visible block must therefore enable every source it mirrors.
UPDATE public.proposals p
SET mirror_contribution_resources = TRUE,
    mirror_infrastructure = TRUE,
    updated_at = now()
FROM public.proposal_cards pc
WHERE pc.proposal_id = p.id
  AND pc.template_key = 'b32.capacity'
  AND pc.is_visible
  AND NOT (p.mirror_contribution_resources AND p.mirror_infrastructure);

UPDATE public.proposals p
SET mirror_value_chain = TRUE,
    mirror_industrial_involvement = TRUE,
    updated_at = now()
FROM public.proposal_cards pc
WHERE pc.proposal_id = p.id
  AND pc.template_key = 'b32.value_chain_industrial'
  AND pc.is_visible
  AND NOT (p.mirror_value_chain AND p.mirror_industrial_involvement);

UPDATE public.proposals p
SET mirror_participation_justification = TRUE,
    updated_at = now()
FROM public.proposal_cards pc
WHERE pc.proposal_id = p.id
  AND pc.template_key = 'b32.other_countries'
  AND pc.is_visible
  AND NOT p.mirror_participation_justification;