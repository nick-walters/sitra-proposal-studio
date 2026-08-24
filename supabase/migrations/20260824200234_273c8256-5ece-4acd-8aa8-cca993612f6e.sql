ALTER TABLE public.template_versions
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;

-- Claim (or take over) the editing lock on a template type's draft.
CREATE OR REPLACE FUNCTION public.claim_template_draft(
  p_template_type_id uuid,
  p_takeover boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_draft uuid;
  v_holder uuid;
BEGIN
  IF NOT public.is_global_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: platform owners only';
  END IF;

  v_draft := public.ensure_template_draft(p_template_type_id);

  SELECT locked_by INTO v_holder FROM public.template_versions WHERE id = v_draft FOR UPDATE;

  IF v_holder IS NOT NULL AND v_holder <> auth.uid() AND NOT p_takeover THEN
    RETURN jsonb_build_object('ok', false, 'version_id', v_draft, 'locked_by', v_holder);
  END IF;

  UPDATE public.template_versions
     SET locked_by = auth.uid(),
         locked_at = CASE WHEN locked_by = auth.uid() THEN COALESCE(locked_at, now()) ELSE now() END
   WHERE id = v_draft;

  RETURN jsonb_build_object('ok', true, 'version_id', v_draft,
                            'taken_over_from', CASE WHEN v_holder IS DISTINCT FROM auth.uid() THEN v_holder END);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_template_draft(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_template_draft(uuid, boolean) TO authenticated;

-- Publishing clears the lock along with cutting the version.
CREATE OR REPLACE FUNCTION public.publish_template_version(p_version_id uuid, p_major boolean DEFAULT false, p_name text DEFAULT NULL::text, p_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_type uuid;
  v_major integer;
  v_minor integer;
  v_holder uuid;
BEGIN
  IF NOT public.is_global_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Permission denied: platform owners only';
  END IF;

  SELECT template_type_id, locked_by INTO v_type, v_holder FROM public.template_versions
   WHERE id = p_version_id AND status = 'draft';
  IF v_type IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'No open draft to publish'); END IF;

  IF v_holder IS NOT NULL AND v_holder <> auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This draft is being edited by another owner');
  END IF;

  SELECT COALESCE(max(major), 1) INTO v_major FROM public.template_versions
   WHERE template_type_id = v_type AND status = 'published';

  IF p_major THEN
    v_major := v_major + 1;
    v_minor := 0;
  ELSE
    SELECT COALESCE(max(minor), -1) + 1 INTO v_minor FROM public.template_versions
     WHERE template_type_id = v_type AND status = 'published' AND major = v_major;
  END IF;

  UPDATE public.template_versions
     SET status = 'published', major = v_major, minor = v_minor,
         name = NULLIF(btrim(COALESCE(p_name, '')), ''), notes = p_notes,
         published_at = now(), published_by = auth.uid(),
         locked_by = NULL, locked_at = NULL
   WHERE id = p_version_id;

  RETURN jsonb_build_object('ok', true, 'version_id', p_version_id, 'major', v_major, 'minor', v_minor);
END;
$function$;