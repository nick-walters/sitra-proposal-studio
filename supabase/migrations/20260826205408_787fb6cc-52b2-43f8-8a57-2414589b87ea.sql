DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'restore_proposal_snapshot';
  IF d IS NULL THEN RAISE EXCEPTION 'restore_proposal_snapshot not found'; END IF;
  d := regexp_replace(
         d,
         '\s*b31_show_(other_direct_costs|fstp_justification|internally_invoiced_justification|all_equipment_justification)\s*=\s*\(v_snap_prop ->> ''b31_show_[a-z_]+''\)::boolean,',
         '', 'g');
  EXECUTE d;
END $$;

ALTER TABLE public.proposals
  DROP COLUMN IF EXISTS b31_show_other_direct_costs,
  DROP COLUMN IF EXISTS b31_show_all_equipment_justification,
  DROP COLUMN IF EXISTS b31_show_fstp_justification,
  DROP COLUMN IF EXISTS b31_show_internally_invoiced_justification;