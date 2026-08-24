alter table public.methodology_linked_activities
  add column if not exists deleted_at timestamptz;

comment on column public.methodology_linked_activities.deleted_at is
  'Soft-delete marker powering the Restore activity recycle bin on the methodologies board.';