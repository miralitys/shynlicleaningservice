begin;

create table if not exists public.profitability_records (
  id text primary key,
  version integer not null check (version > 0),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table if not exists public.profitability_events (
  id uuid primary key default gen_random_uuid(),
  record_id text not null,
  occurred_at timestamptz not null default now(),
  actor jsonb not null,
  before_data jsonb not null,
  after_data jsonb not null
);
create index if not exists profitability_events_record_idx on public.profitability_events(record_id, occurred_at desc, id desc);
alter table public.profitability_records enable row level security;
alter table public.profitability_events enable row level security;
revoke all on public.profitability_records, public.profitability_events from public, anon, authenticated;
grant select, insert, update on public.profitability_records to service_role;
grant select, insert on public.profitability_events to service_role;

create or replace function public.save_profitability_record(
  p_record_id text, p_patch jsonb, p_expected_version integer, p_actor jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  old_record public.profitability_records;
  new_record public.profitability_records;
begin
  if p_expected_version is null or p_expected_version < 0 or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'Invalid financial update' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('profitability:' || p_record_id, 0));
  if p_record_id <> 'settings' and not exists (select 1 from public.quote_ops_entries where id::text = p_record_id) then
    raise exception 'Order does not exist' using errcode = '22023';
  end if;
  select * into old_record from public.profitability_records where id = p_record_id for update;
  if coalesce(old_record.version, 0) <> p_expected_version then
    raise exception 'Financial record version conflict' using errcode = '23505';
  end if;
  insert into public.profitability_records(id, version, data, updated_at)
    values (p_record_id, p_expected_version + 1, coalesce(old_record.data, '{}'::jsonb) || p_patch, now())
    on conflict (id) do update set version = excluded.version, data = excluded.data, updated_at = excluded.updated_at
    returning * into new_record;
  insert into public.profitability_events(record_id, actor, before_data, after_data)
    values(p_record_id, p_actor, coalesce(old_record.data, '{}'::jsonb), new_record.data);
  return to_jsonb(new_record);
end;
$$;
revoke all on function public.save_profitability_record(text, jsonb, integer, jsonb) from public, anon, authenticated;
grant execute on function public.save_profitability_record(text, jsonb, integer, jsonb) to service_role;
create or replace function public.save_profitability_batch(p_updates jsonb, p_actor jsonb)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare item jsonb; result jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_updates) <> 'array' or jsonb_array_length(p_updates) not between 1 and 500 then
    raise exception 'Invalid batch' using errcode = '22023';
  end if;
  for item in select value from jsonb_array_elements(p_updates) order by value->>'id' loop
    result := result || jsonb_build_array(public.save_profitability_record(item->>'id', item->'patch', (item->>'version')::integer, p_actor));
  end loop;
  return result;
end;
$$;
revoke all on function public.save_profitability_batch(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_profitability_batch(jsonb, jsonb) to service_role;
commit;
