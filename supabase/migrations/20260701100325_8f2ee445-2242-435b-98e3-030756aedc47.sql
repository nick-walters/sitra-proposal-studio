CREATE OR REPLACE FUNCTION public.insert_section_version(p_proposal_id uuid, p_section_id text, p_content text, p_created_by uuid, p_is_auto_save boolean DEFAULT true)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_ver integer;
  v_author uuid;
BEGIN
  -- Authorization: caller must be able to edit this proposal
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: caller cannot edit this proposal';
  END IF;

  -- Anti-forgery: ignore caller-supplied p_created_by; force authorship to auth.uid()
  v_author := auth.uid();

  -- Lock the relevant rows to prevent race conditions (without aggregate)
  PERFORM 1 FROM section_versions
  WHERE proposal_id = p_proposal_id
    AND section_id = p_section_id
  FOR UPDATE;

  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_ver
  FROM section_versions
  WHERE proposal_id = p_proposal_id
    AND section_id = p_section_id;

  INSERT INTO section_versions (proposal_id, section_id, content, created_by, version_number, is_auto_save)
  VALUES (p_proposal_id, p_section_id, p_content, v_author, next_ver, p_is_auto_save);

  RETURN next_ver;
END;
$function$;