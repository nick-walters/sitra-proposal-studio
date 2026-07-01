
-- 1) Fix thin_section_versions: require caller has edit rights on the proposal
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
  -- Authorization: only users who can edit this proposal may thin its versions
  IF auth.uid() IS NULL OR NOT public.can_edit_proposal(auth.uid(), p_proposal_id) THEN
    RAISE EXCEPTION 'Permission denied: caller cannot edit this proposal';
  END IF;

  -- Set thinning flag to bypass delete trigger
  PERFORM set_config('app.allow_thinning', 'true', true);

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
    -- Extra defense-in-depth: scope delete to this proposal_id
    DELETE FROM section_versions WHERE id = r.id AND proposal_id = p_proposal_id;
    deleted_count := deleted_count + 1;
  END LOOP;

  PERFORM set_config('app.allow_thinning', 'false', true);

  RETURN deleted_count;
END;
$function$;

-- 2) Fix realtime.messages SELECT policy: replace vulnerable regex substring match
--    with FULL-UUID exact and prefix/suffix matching using the whole proposal_id.
DROP POLICY IF EXISTS "Authenticated users can receive realtime messages for their cha" ON realtime.messages;

CREATE POLICY "Authenticated users can receive realtime messages for their cha"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  public.is_global_admin(auth.uid())
  OR topic = 'realtime:notifications'
  OR topic = 'realtime:profile-name-check'
  OR (
    topic = 'realtime:proposals-realtime'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.proposal_id IS NOT NULL
    )
  )
  OR (
    topic LIKE 'realtime:feedback-comments-%'
    AND EXISTS (
      SELECT 1 FROM public.feedback f
      WHERE f.id = (substring(messages.topic, 'realtime:feedback-comments-(.*)'))::uuid
        AND f.user_id = auth.uid()
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.proposal_id IS NOT NULL
      AND (
        -- Exact full-UUID channel names
        messages.topic = 'realtime:visibility-locks-'      || ur.proposal_id::text
        OR messages.topic = 'realtime:section_assignments:' || ur.proposal_id::text
        OR messages.topic = 'realtime:references-'          || ur.proposal_id::text
        OR messages.topic = 'realtime:section_content-cite-'|| ur.proposal_id::text
        OR messages.topic = 'realtime:b11-participants-'    || ur.proposal_id::text
        OR messages.topic = 'realtime:availability-'        || ur.proposal_id::text
        OR messages.topic = 'realtime:messages-'            || ur.proposal_id::text
        OR messages.topic = 'realtime:proposal:'            || ur.proposal_id::text || ':cursors'
        -- Full-UUID + structured suffix (section id / random uuid)
        OR messages.topic LIKE 'realtime:section_content:'      || ur.proposal_id::text || ':%'
        OR messages.topic LIKE 'realtime:comments:'             || ur.proposal_id::text || ':%'
        OR messages.topic LIKE 'realtime:block-locks:'          || ur.proposal_id::text || ':%'
        OR messages.topic LIKE 'realtime:wp-drafts-nav-'        || ur.proposal_id::text || '-%'
        OR messages.topic LIKE 'realtime:wp-themes-nav-'        || ur.proposal_id::text || '-%'
        OR messages.topic LIKE 'realtime:proposal-themes-flag-' || ur.proposal_id::text || '-%'
        OR messages.topic LIKE 'realtime:case-drafts-nav-'      || ur.proposal_id::text || '-%'
      )
  )
);
