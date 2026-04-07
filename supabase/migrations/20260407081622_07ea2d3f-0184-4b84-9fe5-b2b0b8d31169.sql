
ALTER TABLE public.wp_drafts
  ADD COLUMN is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN locked_at timestamptz;

ALTER TABLE public.case_drafts
  ADD COLUMN is_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN locked_at timestamptz;
