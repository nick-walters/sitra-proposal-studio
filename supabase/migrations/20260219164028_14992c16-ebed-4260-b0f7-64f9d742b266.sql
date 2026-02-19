-- Prevent ANY deletion of section versions at the database level
CREATE OR REPLACE FUNCTION public.prevent_section_version_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  RAISE EXCEPTION 'Deletion of section versions is not permitted';
END;
$$;

CREATE TRIGGER no_delete_section_versions
  BEFORE DELETE ON public.section_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_section_version_delete();

-- Also prevent updates to version content (immutability)
CREATE OR REPLACE FUNCTION public.prevent_section_version_update()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content
     OR OLD.version_number IS DISTINCT FROM NEW.version_number
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'Modification of section version content, number, or timestamp is not permitted';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER no_update_section_versions
  BEFORE UPDATE ON public.section_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_section_version_update();