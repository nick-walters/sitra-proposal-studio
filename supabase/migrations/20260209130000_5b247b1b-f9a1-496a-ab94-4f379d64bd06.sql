-- Add foreign key from section_comments.user_id to profiles.id so PostgREST join works
ALTER TABLE public.section_comments
  ADD CONSTRAINT section_comments_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
