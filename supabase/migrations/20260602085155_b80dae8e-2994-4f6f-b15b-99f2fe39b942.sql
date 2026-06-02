
-- Lock down EXECUTE on SECURITY DEFINER functions in the public schema.
-- Default privileges previously left every function callable by anon and
-- authenticated; we now revoke broadly and re-grant only what the app needs.

-- Helper / RPC functions: keep callable by signed-in users only.
DO $$
DECLARE fname text;
BEGIN
  FOR fname IN SELECT unnest(ARRAY[
    'can_edit_proposal(uuid,uuid)',
    'has_any_proposal_role(uuid,uuid)',
    'has_proposal_role(uuid,uuid,app_role)',
    'is_coordinator_or_above(uuid)',
    'is_global_admin(uuid)',
    'is_message_recipient(uuid,uuid)',
    'is_owner(uuid)',
    'is_proposal_admin(uuid,uuid)',
    'insert_section_version(uuid,text,text,uuid,boolean)',
    'thin_section_versions(uuid)',
    'create_proposal_with_role(text,text,proposal_type,budget_type,text,text,text,text,timestamptz,uuid,boolean)'
  ]) LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', fname);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', fname);
  END LOOP;
END $$;

-- Trigger-only functions: revoke from everyone except postgres/service_role.
-- Triggers fire via the table owner and do not need anon/authenticated EXECUTE.
DO $$
DECLARE fname text;
BEGIN
  FOR fname IN SELECT unnest(ARRAY[
    'cleanup_orphaned_organisations()',
    'cleanup_orphaned_organisations_participant()',
    'downgrade_editors_on_submit()',
    'handle_new_user()',
    'initialize_b31_tasks()',
    'initialize_wp_drafts()',
    'notify_feedback_comment()',
    'notify_owners_on_feedback()',
    'prevent_section_version_delete()',
    'prevent_section_version_update()',
    'update_updated_at()',
    'update_updated_at_column()'
  ]) LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fname);
  END LOOP;
END $$;

-- Drop overly broad anonymous SELECT policies on public buckets.
-- These policies let anyone list every file in the bucket via PostgREST.
-- Public file URLs continue to work through the storage CDN endpoint,
-- which does not consult RLS.
DROP POLICY IF EXISTS "Anyone can view participant logos" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for logos" ON storage.objects;
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Logos are publicly accessible" ON storage.objects;
