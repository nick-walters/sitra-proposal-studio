ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS track_changes_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.track_changes_enabled IS
  'Per-user, platform-wide "track my changes" preference. Recording only; accept/reject is separate.';