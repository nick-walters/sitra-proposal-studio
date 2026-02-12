
-- Delete duplicate versions, keeping the latest by created_at
DELETE FROM section_versions a
USING section_versions b
WHERE a.proposal_id = b.proposal_id
  AND a.section_id = b.section_id
  AND a.version_number = b.version_number
  AND a.created_at < b.created_at;

-- Add unique constraint
ALTER TABLE section_versions
ADD CONSTRAINT section_versions_unique_version
UNIQUE (proposal_id, section_id, version_number);

-- Create atomic version insertion function
CREATE OR REPLACE FUNCTION public.insert_section_version(
  p_proposal_id uuid,
  p_section_id text,
  p_content text,
  p_created_by uuid,
  p_is_auto_save boolean DEFAULT true
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_ver integer;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1
  INTO next_ver
  FROM section_versions
  WHERE proposal_id = p_proposal_id
    AND section_id = p_section_id
  FOR UPDATE;

  INSERT INTO section_versions (proposal_id, section_id, content, created_by, version_number, is_auto_save)
  VALUES (p_proposal_id, p_section_id, p_content, p_created_by, next_ver, p_is_auto_save);

  RETURN next_ver;
END;
$$;
