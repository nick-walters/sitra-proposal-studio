CREATE OR REPLACE FUNCTION public.save_case_subsection_guideline(p_template_id uuid, p_guideline text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pid uuid;
BEGIN
  SELECT proposal_id INTO v_pid FROM public.case_subsection_templates WHERE id = p_template_id;
  IF v_pid IS NULL THEN
    RAISE EXCEPTION 'Subsection not found';
  END IF;
  IF NOT public.is_proposal_admin(auth.uid(), v_pid) THEN
    RAISE EXCEPTION 'Only a coordinator or above may edit case guidance';
  END IF;
  UPDATE public.case_subsection_templates
  SET guideline = NULLIF(btrim(coalesce(p_guideline, '')), '')
  WHERE id = p_template_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.save_case_subsection_guideline(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_case_subsection_guideline(uuid, text) TO authenticated;