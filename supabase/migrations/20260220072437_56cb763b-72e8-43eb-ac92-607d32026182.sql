
-- Part 1d: Add columns to section_versions
ALTER TABLE public.section_versions
  ADD COLUMN IF NOT EXISTS label text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS is_major boolean DEFAULT false NOT NULL;

-- Update prevent_section_version_update trigger to allow label/is_pinned/is_major changes
CREATE OR REPLACE FUNCTION public.prevent_section_version_update()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  IF OLD.content IS DISTINCT FROM NEW.content
     OR OLD.version_number IS DISTINCT FROM NEW.version_number
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'Modification of section version content, number, or timestamp is not permitted';
  END IF;
  RETURN NEW;
END;
$function$;

-- Update prevent_section_version_delete to allow thinning
CREATE OR REPLACE FUNCTION public.prevent_section_version_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $function$
BEGIN
  IF current_setting('app.allow_thinning', true) = 'true' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Deletion of section versions is not permitted';
END;
$function$;

-- RLS policy: allow coordinators/admins/owners to update label/pin/major
CREATE POLICY "Admins can update version metadata"
  ON public.section_versions
  FOR UPDATE
  TO authenticated
  USING (public.is_proposal_admin(auth.uid(), proposal_id))
  WITH CHECK (public.is_proposal_admin(auth.uid(), proposal_id));

-- Part 1f: Intelligent retention thinning function
CREATE OR REPLACE FUNCTION public.thin_section_versions(p_proposal_id uuid)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  deleted_count integer := 0;
  r record;
BEGIN
  -- Set thinning flag to bypass delete trigger
  PERFORM set_config('app.allow_thinning', 'true', true);

  -- Delete minor versions that exceed retention thresholds
  -- Never delete: pinned, labeled, major, version 1, or latest per section
  FOR r IN
    WITH latest_per_section AS (
      SELECT DISTINCT ON (section_id) id
      FROM section_versions
      WHERE proposal_id = p_proposal_id
      ORDER BY section_id, version_number DESC
    ),
    candidates AS (
      SELECT sv.id, sv.section_id, sv.created_at, sv.version_number,
        ROW_NUMBER() OVER (
          PARTITION BY sv.section_id,
            CASE
              WHEN sv.created_at > now() - interval '7 days' THEN 'keep_all'
              WHEN sv.created_at > now() - interval '30 days' THEN date_trunc('hour', sv.created_at)::text
              WHEN sv.created_at > now() - interval '90 days' THEN date_trunc('day', sv.created_at)::text
              ELSE date_trunc('week', sv.created_at)::text
            END
          ORDER BY sv.created_at DESC
        ) AS rn,
        CASE WHEN sv.created_at > now() - interval '7 days' THEN 'keep_all' ELSE 'thin' END AS age_bucket
      FROM section_versions sv
      WHERE sv.proposal_id = p_proposal_id
        AND sv.is_pinned = false
        AND sv.is_major = false
        AND sv.label IS NULL
        AND sv.version_number > 1
        AND sv.id NOT IN (SELECT id FROM latest_per_section)
    )
    SELECT id FROM candidates
    WHERE age_bucket = 'thin' AND rn > 1
  LOOP
    DELETE FROM section_versions WHERE id = r.id;
    deleted_count := deleted_count + 1;
  END LOOP;

  -- Reset thinning flag
  PERFORM set_config('app.allow_thinning', 'false', true);

  RETURN deleted_count;
END;
$function$;
