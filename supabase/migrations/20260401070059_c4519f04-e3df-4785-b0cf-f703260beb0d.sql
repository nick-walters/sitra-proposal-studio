CREATE OR REPLACE VIEW public.profiles_basic AS
SELECT id, full_name, first_name, last_name, email, avatar_url, organisation, phone_number, country_code
FROM profiles;
ALTER VIEW public.profiles_basic SET (security_invoker = true);