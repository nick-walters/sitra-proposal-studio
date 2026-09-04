alter table public.proposal_backups
  add column if not exists run_status text not null default 'complete',
  add column if not exists expected_file_count integer,
  add column if not exists missing_files jsonb not null default '[]'::jsonb;

alter table public.proposal_backups
  drop constraint if exists proposal_backups_run_status_check;

alter table public.proposal_backups
  add constraint proposal_backups_run_status_check
  check (run_status in ('complete','partial','failed'));