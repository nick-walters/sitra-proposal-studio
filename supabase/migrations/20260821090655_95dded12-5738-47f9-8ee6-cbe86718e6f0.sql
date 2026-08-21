DO $$
DECLARE v_proposal uuid;
BEGIN
  SELECT id INTO v_proposal FROM public.proposals WHERE acronym = 'ZZ-3B-VERIFY';
  IF v_proposal IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE proposal_id = v_proposal;
    DELETE FROM public.proposals WHERE id = v_proposal;
  END IF;
END $$;