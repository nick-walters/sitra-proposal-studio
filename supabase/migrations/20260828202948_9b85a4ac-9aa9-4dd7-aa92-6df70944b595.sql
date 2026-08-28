UPDATE public.card_templates SET is_deletable = false WHERE kind = 'references' AND is_deletable;
UPDATE public.proposal_cards SET is_deletable = false WHERE kind = 'references' AND is_deletable;