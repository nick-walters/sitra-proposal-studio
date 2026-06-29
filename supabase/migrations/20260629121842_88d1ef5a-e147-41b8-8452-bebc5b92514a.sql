ALTER TABLE public.budget_changes
  ADD CONSTRAINT budget_changes_user_id_profiles_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;