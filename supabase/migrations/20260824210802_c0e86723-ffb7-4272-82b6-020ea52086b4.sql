DO $$
DECLARE
  r record;
  def text;
  newdef text;
  args text;
  expr text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosrc LIKE '%can_edit_proposal(p_proposal_id)%'
  LOOP
    def := pg_get_functiondef(r.oid);
    args := pg_get_function_arguments(r.oid);

    IF args LIKE '%p_proposal_id uuid%' THEN
      expr := 'p_proposal_id';
    ELSIF args LIKE '%p_card_id uuid%' THEN
      expr := '(SELECT proposal_id FROM public.proposal_cards WHERE id = p_card_id)';
    ELSIF args LIKE '%p_field_id uuid%' THEN
      expr := '(SELECT proposal_id FROM public.card_fields WHERE id = p_field_id)';
    ELSIF args LIKE '%p_section_id uuid%' THEN
      expr := '(SELECT pt.proposal_id FROM public.proposal_template_sections s JOIN public.proposal_templates pt ON pt.id = s.proposal_template_id WHERE s.id = p_section_id)';
    ELSE
      expr := NULL;
    END IF;

    IF expr IS NULL THEN
      -- Lock heartbeat/release: already scoped to the signed-in holder's own row.
      newdef := regexp_replace(
        def,
        E'[ \t]*IF NOT public\\.can_edit_proposal\\(p_proposal_id\\) THEN\\s*\\n[ \t]*RAISE EXCEPTION[^\\n]*\\n[ \t]*END IF;\\s*\\n',
        '',
        'g'
      );
    ELSE
      newdef := replace(def, 'public.can_edit_proposal(p_proposal_id)',
                             'public.can_edit_proposal(auth.uid(), ' || expr || ')');
    END IF;

    IF newdef LIKE '%can_edit_proposal(p_proposal_id)%' THEN
      RAISE EXCEPTION 'Function %: guard rewrite failed', r.proname;
    END IF;
    EXECUTE newdef;
  END LOOP;
END $$;