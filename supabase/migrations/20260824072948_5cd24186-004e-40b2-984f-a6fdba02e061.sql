create table public.card_collapse_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null references public.proposal_cards(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

grant select, insert, delete on public.card_collapse_states to authenticated;
grant all on public.card_collapse_states to service_role;

alter table public.card_collapse_states enable row level security;

create policy "Users view their own collapse states"
  on public.card_collapse_states for select to authenticated
  using (auth.uid() = user_id);

create policy "Users collapse blocks for themselves"
  on public.card_collapse_states for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users expand their own collapsed blocks"
  on public.card_collapse_states for delete to authenticated
  using (auth.uid() = user_id);