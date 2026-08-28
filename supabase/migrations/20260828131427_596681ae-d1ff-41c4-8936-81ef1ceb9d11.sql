UPDATE public.card_templates SET is_deletable = true WHERE section_number = 'B3.1' AND key = 'b31.intro';
UPDATE public.proposal_cards pc SET is_deletable = true
WHERE pc.template_key = 'b31.intro';