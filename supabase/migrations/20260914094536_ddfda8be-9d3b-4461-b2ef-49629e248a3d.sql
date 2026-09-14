-- Column-level SELECT privileges: Postgres RLS is row-level only, so the
-- column privilege system is what actually stops a colleague reading another
-- person's home address. Every existing reader of public.profiles selects
-- named columns, none of which is in the restricted set.
REVOKE SELECT ON public.profiles FROM authenticated;
REVOKE SELECT ON public.profiles FROM anon;

GRANT SELECT (
  id,
  email,
  full_name,
  first_name,
  last_name,
  avatar_url,
  organisation,
  department,
  phone_number,
  country,
  country_code,
  website,
  linkedin,
  bluesky,
  instagram,
  facebook,
  other_links,
  track_changes_enabled,
  feature_tour_seen_at,
  created_at,
  updated_at
) ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

-- The co-member row policy stays, but is now column-limited by the grants
-- above: it can no longer expose the whole row.
DROP POLICY IF EXISTS "Co-members can view profiles" ON public.profiles;
CREATE POLICY "Co-members can view profiles"
ON public.profiles
FOR SELECT
USING (
  auth.uid() IS NOT NULL
  AND (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur1
      JOIN public.user_roles ur2 ON ur1.proposal_id = ur2.proposal_id
      WHERE ur1.user_id = auth.uid()
        AND ur2.user_id = profiles.id
        AND ur1.proposal_id IS NOT NULL
    )
    OR public.is_global_admin(auth.uid())
    OR public.is_owner(auth.uid())
  )
);

COMMENT ON POLICY "Co-members can view profiles" ON public.profiles IS
  'Row access for people sharing a proposal. Column access is limited by the '
  'column-level SELECT grants on public.profiles: address, address_line_2, '
  'postcode, city and gdpr_consented_at are NOT granted to authenticated and '
  'are readable only through public.profiles_full or get_my_private_profile().';

-- Full-row access for the owner and for coordinator-and-above / global admins.
-- SECURITY DEFINER (security_invoker = false) so it bypasses the column grants
-- for exactly those cases.
CREATE OR REPLACE VIEW public.profiles_full
WITH (security_invoker = false) AS
SELECT p.*
FROM public.profiles p
WHERE p.id = auth.uid()
   OR public.is_coordinator_or_above(auth.uid())
   OR public.is_global_admin(auth.uid());

REVOKE ALL ON public.profiles_full FROM anon;
GRANT SELECT ON public.profiles_full TO authenticated;
GRANT ALL ON public.profiles_full TO service_role;

COMMENT ON VIEW public.profiles_full IS
  'Complete profile rows: your own, plus every row for coordinator-and-above '
  'and global admins. SECURITY DEFINER on purpose — ordinary users reading a '
  'colleague must use public.profiles_basic or the granted columns.';