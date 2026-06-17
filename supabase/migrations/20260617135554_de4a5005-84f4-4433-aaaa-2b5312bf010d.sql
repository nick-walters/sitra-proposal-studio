
-- Restrict sensitive PII columns on profiles to the owner (and admins) only.
-- Postgres RLS cannot filter columns, so we combine column-level GRANTs with a
-- SECURITY DEFINER RPC for the owner to read their own private fields.

-- 1. Revoke direct SELECT access to sensitive columns from regular roles.
REVOKE SELECT (phone_number, country_code, address, address_line_2, postcode, city, gdpr_consented_at)
  ON public.profiles FROM authenticated;
REVOKE SELECT (phone_number, country_code, address, address_line_2, postcode, city, gdpr_consented_at)
  ON public.profiles FROM anon;

-- 2. Rebuild the public-facing basic view without contact details.
DROP VIEW IF EXISTS public.profiles_basic;
CREATE VIEW public.profiles_basic
WITH (security_invoker = true) AS
SELECT id, full_name, first_name, last_name, email, avatar_url, organisation
FROM public.profiles;
GRANT SELECT ON public.profiles_basic TO authenticated;

-- 3. RPC: owner reads their own private profile fields.
CREATE OR REPLACE FUNCTION public.get_my_private_profile()
RETURNS TABLE (
  phone_number text,
  country_code text,
  address text,
  address_line_2 text,
  postcode text,
  city text,
  gdpr_consented_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.phone_number, p.country_code, p.address, p.address_line_2,
         p.postcode, p.city, p.gdpr_consented_at
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_private_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_private_profile() TO authenticated;
