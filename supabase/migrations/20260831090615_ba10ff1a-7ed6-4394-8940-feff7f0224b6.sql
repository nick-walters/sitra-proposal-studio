
create extension if not exists pg_cron with schema pg_catalog;

-- Cron-safe wrappers: the interactive functions require an authenticated
-- caller, which a scheduled job has not got. These run as owner and are
-- callable by service_role/postgres only.

create or replace function public.cron_purge_deleted_cards()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_field_ids uuid[]; v_card_ids uuid[]; v_generic uuid[]; v_count integer := 0; v_keys text[];
begin
  select array_agg(target_id) into v_field_ids from public.card_deletions
   where target_type = 'field' and restored_at is null and purge_after is not null and purge_after < now();
  select array_agg(target_id) into v_card_ids from public.card_deletions
   where target_type = 'card' and restored_at is null and purge_after is not null and purge_after < now();
  select array_agg(target_id) into v_generic from public.card_deletions
   where target_type not in ('card','field') and restored_at is null
     and purge_after is not null and purge_after < now();

  perform set_config('app.card_bin_ok', '1', true);

  v_keys := array[]::text[];
  if v_field_ids is not null then
    select v_keys || array_agg('card_field:' || id::text) into v_keys from unnest(v_field_ids) as id;
  end if;
  if v_card_ids is not null then
    select v_keys || array_agg('card:' || id::text || ':title') into v_keys from unnest(v_card_ids) as id;
    delete from public.section_comments c
     using public.card_fields f
     where c.anchor_type = 'module'
       and f.card_id = any(v_card_ids)
       and c.anchor_payload->>'targetKey' = 'card_field:' || f.id::text;
  end if;
  if array_length(v_keys, 1) is not null then
    delete from public.section_comments
     where anchor_type = 'module' and anchor_payload->>'targetKey' = any(v_keys);
  end if;
  if v_generic is not null then
    delete from public.section_comments
     where anchor_type = 'module'
       and split_part(anchor_payload->>'targetKey', ':', 2) = any(select id::text from unnest(v_generic) as id);
  end if;

  if v_card_ids is not null then
    delete from public.card_field_versions v using public.card_fields f
     where v.field_id = f.id and f.card_id = any(v_card_ids);
  end if;
  if v_field_ids is not null then
    delete from public.card_field_versions where field_id = any(v_field_ids);
    delete from public.card_fields where id = any(v_field_ids) and deleted_at is not null;
  end if;
  if v_card_ids is not null then
    delete from public.card_fields where card_id = any(v_card_ids);
    delete from public.proposal_cards where id = any(v_card_ids) and deleted_at is not null;
  end if;
  if v_generic is not null then
    delete from public.card_field_versions where target_type <> 'card_field' and target_id = any(v_generic);
  end if;

  with d as (
    delete from public.card_deletions
     where restored_at is null and purge_after is not null and purge_after < now()
    returning 1
  ) select count(*) into v_count from d;

  with f as (
    delete from public.figures fg
     where fg.deleted_at is not null and fg.purge_after is not null and fg.purge_after < now()
       and not exists (select 1 from public.card_figure cf where cf.figure_id = fg.id)
    returning 1
  ) select v_count + count(*) into v_count from f;

  perform set_config('app.card_bin_ok', '0', true);
  return v_count;
end;
$$;

create or replace function public.cron_thin_proposal_snapshots(p_keep_manual integer default 10, p_keep_auto integer default 10)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_deleted integer := 0;
begin
  with ranked as (
    select id,
      row_number() over (
        partition by proposal_id, case when source = 'auto' then 'auto' else 'manual' end
        order by created_at desc) as rn,
      source
    from public.proposal_snapshots
  ), to_delete as (
    select id from ranked
     where (source = 'auto' and rn > p_keep_auto)
        or (source is distinct from 'auto' and rn > p_keep_manual)
  )
  delete from public.proposal_snapshots ps using to_delete d where ps.id = d.id;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

create or replace function public.cron_thin_target_versions()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_deleted integer := 0;
begin
  perform set_config('app.card_bin_ok', '1', true);
  with latest_per_box as (
    select distinct on (proposal_id, target_type, target_id, text_box) id
    from public.card_field_versions
    order by proposal_id, target_type, target_id, text_box, version_number desc
  ), candidates as (
    select cv.id,
      row_number() over (
        partition by cv.proposal_id, cv.target_type, cv.target_id, cv.text_box,
          case
            when cv.created_at > now() - interval '7 days' then 'keep_all'
            when cv.created_at > now() - interval '30 days' then date_trunc('hour', cv.created_at)::text
            when cv.created_at > now() - interval '90 days' then date_trunc('day', cv.created_at)::text
            else date_trunc('week', cv.created_at)::text
          end
        order by cv.created_at desc) as rn,
      case when cv.created_at > now() - interval '7 days' then 'keep_all' else 'thin' end as age_bucket
    from public.card_field_versions cv
    where cv.is_auto_save = true and cv.version_number > 1
      and cv.id not in (select id from latest_per_box)
  ), doomed as (
    select id from candidates where age_bucket = 'thin' and rn > 1
  )
  delete from public.card_field_versions v using doomed d where v.id = d.id;
  get diagnostics v_deleted = row_count;
  perform set_config('app.card_bin_ok', '0', true);
  return v_deleted;
end;
$$;

revoke all on function public.cron_purge_deleted_cards() from public, anon, authenticated;
revoke all on function public.cron_thin_proposal_snapshots(integer, integer) from public, anon, authenticated;
revoke all on function public.cron_thin_target_versions() from public, anon, authenticated;
grant execute on function public.cron_purge_deleted_cards() to service_role;
grant execute on function public.cron_thin_proposal_snapshots(integer, integer) to service_role;
grant execute on function public.cron_thin_target_versions() to service_role;

select cron.schedule('purge-deleted-cards-daily', '15 2 * * *', $$select public.cron_purge_deleted_cards();$$);
select cron.schedule('thin-proposal-snapshots-daily', '30 2 * * *', $$select public.cron_thin_proposal_snapshots();$$);
select cron.schedule('thin-target-versions-daily', '45 2 * * *', $$select public.cron_thin_target_versions();$$);
