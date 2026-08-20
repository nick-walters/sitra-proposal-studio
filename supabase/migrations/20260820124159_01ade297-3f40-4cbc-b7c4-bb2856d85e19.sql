INSERT INTO public.user_roles (id, user_id, proposal_id, role, created_at)
SELECT id, user_id, proposal_id, role, created_at FROM public._zz_role_park
ON CONFLICT (id) DO NOTHING;

DROP TABLE public._zz_role_park;