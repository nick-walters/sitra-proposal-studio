
-- Add phone_number to profiles_basic view
DROP VIEW IF EXISTS public.profiles_basic;

CREATE VIEW public.profiles_basic WITH (security_invoker = true) AS
SELECT id, full_name, first_name, last_name, email, avatar_url, organisation, phone_number
FROM public.profiles;
