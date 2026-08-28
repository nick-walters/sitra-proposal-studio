ALTER TABLE public.section_comments
  ADD COLUMN IF NOT EXISTS assigned_to uuid NULL
    REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS section_comments_assigned_to_idx
  ON public.section_comments (assigned_to)
  WHERE assigned_to IS NOT NULL;

COMMENT ON COLUMN public.section_comments.assigned_to IS
  'Optional single owner of the comment, a user with a role on the proposal. Independent of @tags in the content. Survives resolve/reopen; cleared automatically if the profile is deleted.';