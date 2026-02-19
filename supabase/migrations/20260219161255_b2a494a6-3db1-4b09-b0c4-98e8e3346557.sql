
CREATE OR REPLACE FUNCTION public.insert_section_version(p_proposal_id uuid, p_section_id text, p_content text, p_created_by uuid, p_is_auto_save boolean DEFAULT true)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_ver integer;
BEGIN
  -- Lock the relevant rows to prevent race conditions (without aggregate)
  PERFORM 1 FROM section_versions
  WHERE proposal_id = p_proposal_id
    AND section_id = p_section_id
  FOR UPDATE;

  -- Now safely compute the next version number
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_ver
  FROM section_versions
  WHERE proposal_id = p_proposal_id
    AND section_id = p_section_id;

  INSERT INTO section_versions (proposal_id, section_id, content, created_by, version_number, is_auto_save)
  VALUES (p_proposal_id, p_section_id, p_content, p_created_by, next_ver, p_is_auto_save);

  RETURN next_ver;
END;
$function$;
