CREATE OR REPLACE FUNCTION public.caller_is_sitra_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = auth.uid()
      AND u.email_confirmed_at IS NOT NULL
      AND lower(regexp_replace(u.email, '^.*@', '')) = 'sitra.fi'
  );
$$;