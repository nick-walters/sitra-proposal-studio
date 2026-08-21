DO $$
DECLARE v_proposal uuid;
BEGIN
  SELECT id INTO v_proposal FROM public.proposals WHERE acronym = 'ZZ-3B-VERIFY';
  DELETE FROM public.proposal_cards WHERE proposal_id = v_proposal;
END $$;