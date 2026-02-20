
CREATE OR REPLACE FUNCTION public.create_proposal_with_role(p_acronym text, p_title text, p_type proposal_type, p_budget_type budget_type, p_submission_stage text DEFAULT 'full'::text, p_work_programme text DEFAULT NULL::text, p_destination text DEFAULT NULL::text, p_topic_url text DEFAULT NULL::text, p_deadline timestamp with time zone DEFAULT NULL::timestamp with time zone, p_template_type_id uuid DEFAULT NULL::uuid, p_uses_fstp boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_proposal_id uuid;
  sec record;
  sec_id text;
  sitra_participant_id uuid;
BEGIN
  INSERT INTO public.proposals (
    acronym, title, type, budget_type, submission_stage, work_programme,
    destination, topic_url, deadline, template_type_id, created_by, status, uses_fstp
  ) VALUES (
    p_acronym, p_title, p_type, p_budget_type, p_submission_stage, p_work_programme,
    p_destination, p_topic_url, p_deadline, p_template_type_id, auth.uid(), 'draft', p_uses_fstp
  )
  RETURNING id INTO new_proposal_id;

  INSERT INTO public.user_roles (user_id, proposal_id, role)
  VALUES (auth.uid(), new_proposal_id, 'coordinator');

  -- Add Sitra as default participant #1
  INSERT INTO public.participants (
    proposal_id,
    organisation_name,
    organisation_short_name,
    english_name,
    pic_number,
    organisation_type,
    organisation_category,
    legal_entity_type,
    country,
    is_sme,
    participant_number,
    street,
    postcode,
    town,
    website
  ) VALUES (
    new_proposal_id,
    'Suomen Itsenäisyyden Juhlarahasto',
    'Sitra',
    'The Finnish Innovation Fund',
    '906912365',
    'beneficiary',
    'PUB',
    'PUB',
    'Finland',
    false,
    1,
    'Itämerenkatu 11-13',
    '00180',
    'Helsinki',
    'www.sitra.fi/en'
  )
  RETURNING id INTO sitra_participant_id;

  -- Create department for Sitra
  INSERT INTO public.participant_departments (
    participant_id,
    department_name,
    same_as_organisation,
    order_index
  ) VALUES (
    sitra_participant_id,
    'International Programmes',
    true,
    0
  );

  -- Upsert Sitra to shared organisations registry
  INSERT INTO public.organisations (name, short_name, english_name, pic_number, country, legal_entity_type, is_sme)
  VALUES ('Suomen Itsenäisyyden Juhlarahasto', 'Sitra', 'The Finnish Innovation Fund', '906912365', 'Finland', 'PUB', false)
  ON CONFLICT (pic_number) DO NOTHING;

  -- Set Sitra as lead of WP9 (COORD - Project coordination & administration)
  UPDATE public.wp_drafts
  SET lead_participant_id = sitra_participant_id
  WHERE proposal_id = new_proposal_id AND number = 9;

  -- Create baseline version 1 for every Part B section from the template
  IF p_template_type_id IS NOT NULL THEN
    FOR sec IN
      SELECT section_number FROM public.template_sections
      WHERE template_type_id = p_template_type_id
        AND section_number LIKE 'B%'
      ORDER BY order_index
    LOOP
      sec_id := lower(replace(sec.section_number, '.', '-'));

      INSERT INTO public.section_versions (proposal_id, section_id, content, created_by, version_number, is_auto_save)
      VALUES (new_proposal_id, sec_id, '', auth.uid(), 1, true);
    END LOOP;
  END IF;

  RETURN new_proposal_id;
END;
$function$;

-- Also fix any existing participants with country code 'FI' instead of full name
UPDATE public.participants SET country = 'Finland' WHERE country = 'FI';
UPDATE public.organisations SET country = 'Finland' WHERE country = 'FI';
