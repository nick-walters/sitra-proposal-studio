CREATE TABLE IF NOT EXISTS public._zz_role_park (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  proposal_id uuid,
  role public.app_role NOT NULL,
  created_at timestamptz
);
ALTER TABLE public._zz_role_park ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._zz_role_park FROM anon, authenticated;
GRANT ALL ON public._zz_role_park TO service_role;

INSERT INTO public._zz_role_park (id, user_id, proposal_id, role, created_at)
SELECT id, user_id, proposal_id, role, created_at
FROM public.user_roles
WHERE user_id = 'f102cc7b-632b-462e-bdbc-7b77fa8e0c67' AND proposal_id IS NULL
ON CONFLICT (id) DO NOTHING;

DELETE FROM public.user_roles
WHERE user_id = 'f102cc7b-632b-462e-bdbc-7b77fa8e0c67' AND proposal_id IS NULL;