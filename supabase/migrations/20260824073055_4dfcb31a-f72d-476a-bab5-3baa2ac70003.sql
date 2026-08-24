alter table public.card_collapse_states
  alter column user_id set default auth.uid();