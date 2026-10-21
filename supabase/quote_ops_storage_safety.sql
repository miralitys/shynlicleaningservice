-- Install before deploying storage safety. No existing order/customer rows are rewritten.
begin;
alter table public.admin_audit_events drop constraint if exists admin_audit_events_action_check;
alter table public.admin_audit_events add constraint admin_audit_events_action_check check (action in ('create','update','delete','restore'));

create table if not exists public.quote_ops_trash (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null,
  scope text not null check (scope in ('entry', 'order')),
  deleted_at timestamptz not null default clock_timestamp(),
  actor jsonb not null,
  request_id text not null,
  route text not null,
  row_data jsonb not null,
  live_updated_at timestamptz,
  restored_at timestamptz,
  restored_by jsonb
);
create index if not exists quote_ops_trash_time on public.quote_ops_trash (deleted_at desc, id desc);
create index if not exists quote_ops_trash_entry on public.quote_ops_trash (entry_id);

-- Business snapshots, without repeated SMS histories or policy secrets.
-- The trash table above retains the complete original row for recovery.
-- No FK/cascade: deleting an active row must not remove either its history or its trash copy.
create table if not exists public.quote_ops_mutation_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default clock_timestamp(),
  entry_id uuid not null,
  operation text not null,
  actor jsonb not null,
  request_id text not null,
  route text not null,
  before_data jsonb,
  after_data jsonb
);
create index if not exists quote_ops_mutation_events_entry on public.quote_ops_mutation_events (entry_id, occurred_at desc);

alter table public.quote_ops_trash enable row level security;
alter table public.quote_ops_mutation_events enable row level security;
revoke all on public.quote_ops_trash, public.quote_ops_mutation_events from anon, authenticated, service_role;
grant select on public.quote_ops_trash, public.quote_ops_mutation_events to service_role;

create or replace function public.quote_ops_history_snapshot(p_row jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select (p_row - 'payload_for_retry' - 'retry_history') || jsonb_build_object('payload_for_retry', jsonb_build_object(
    'calculatorData', payload->'calculatorData',
    'adminClient', payload->'adminClient',
    'adminLead', (payload->'adminLead') - array['tasks','taskCreationAudit','taskDeadlineAudit','taskStatusAudit','updatedAt'],
    'orderState', (public.quote_ops_order_state(payload) - array['notifications','policyAcceptance','updatedAt']) || jsonb_build_object(
      'policyAcceptance', jsonb_build_object('status', policy->'status', 'signedAt', policy->'signedAt', 'policyAccepted', policy->'policyAccepted'))))
  from (select coalesce(p_row->'payload_for_retry','{}') payload) v
  cross join lateral (select coalesce(public.quote_ops_order_state(payload)->'policyAcceptance','{}') policy) p;
$$;

create or replace function public.audit_quote_ops_mutation()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  ctx jsonb := coalesce(nullif(current_setting('shynli.audit_context', true), ''), '{}')::jsonb;
  actor_data jsonb;
  prior jsonb;
  next_data jsonb;
  entry uuid;
  business boolean;
begin
  actor_data := coalesce(ctx->'actor', jsonb_build_object('id', session_user, 'role', current_user, 'source', 'database'));
  if tg_op <> 'INSERT' then prior := to_jsonb(old); end if;
  if tg_op <> 'DELETE' then next_data := to_jsonb(new); end if;
  entry := coalesce(new.id, old.id);
  business := coalesce(prior->>'kind', next_data->>'kind', '') not like 'admin\_%' escape '\';
  if not business then return null; end if;
  if tg_op = 'DELETE' then
    insert into public.quote_ops_trash(entry_id, scope, actor, request_id, route, row_data)
      values (entry, 'entry', actor_data, coalesce(ctx->>'requestId',''), coalesce(ctx->>'route',''), prior);
  elsif tg_op = 'UPDATE' and public.quote_ops_order_state(old.payload_for_retry) <> '{}'::jsonb
      and public.quote_ops_order_state(new.payload_for_retry) = '{}'::jsonb then
    insert into public.quote_ops_trash(entry_id, scope, actor, request_id, route, row_data, live_updated_at)
      values (entry, 'order', actor_data, coalesce(ctx->>'requestId',''), coalesce(ctx->>'route',''), prior, new.updated_at);
  end if;
  prior := public.quote_ops_history_snapshot(prior);
  next_data := public.quote_ops_history_snapshot(next_data);
  if (prior - 'updated_at') is distinct from (next_data - 'updated_at') then
    insert into public.quote_ops_mutation_events(entry_id, operation, actor, request_id, route, before_data, after_data)
      values(entry, case when ctx->>'operation' = 'restore' then 'restore'
        when tg_op = 'DELETE' then 'trash' else lower(tg_op) end,
        actor_data, coalesce(ctx->>'requestId',''), coalesce(ctx->>'route',''), prior, next_data);
  end if;
  return null;
end;
$$;
drop trigger if exists quote_ops_durable_history on public.quote_ops_entries;
create trigger quote_ops_durable_history after insert or update or delete on public.quote_ops_entries
  for each row execute function public.audit_quote_ops_mutation();

create or replace function public.save_quote_ops_entry(p_entry jsonb, p_mode text,
    p_expected_updated_at timestamptz, p_audit_context jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  proposed public.quote_ops_entries;
  prior public.quote_ops_entries;
  saved public.quote_ops_entries;
begin
  perform set_config('shynli.audit_context', coalesce(p_audit_context, '{}')::text, true);
  proposed := jsonb_populate_record(null::public.quote_ops_entries, p_entry);
  if proposed.id is null then raise exception 'Entry ID is required'; end if;
  if p_mode = 'insert' then
    -- Unlike an upsert, a new submission may never overwrite another record.
    insert into public.quote_ops_entries select (proposed).* returning * into saved;
  elsif p_mode = 'update' then
    select * into prior from public.quote_ops_entries where id = proposed.id for update;
    if not found or p_expected_updated_at is null or prior.updated_at is distinct from p_expected_updated_at then return null; end if;
    if public.quote_ops_order_state(prior.payload_for_retry) = '{}'::jsonb and
      public.quote_ops_order_state(proposed.payload_for_retry) <> '{}'::jsonb and
      coalesce(p_audit_context->>'operation','') <> 'restore' and
      exists(select 1 from public.quote_ops_trash where entry_id=prior.id and scope='order' and restored_at is null) then
      raise exception 'Order is in trash; restore it explicitly' using errcode='23514';
    end if;
    proposed.created_at := prior.created_at;
    if proposed.updated_at is null or proposed.updated_at <= prior.updated_at then proposed.updated_at := clock_timestamp(); end if;
    update public.quote_ops_entries set
      kind=proposed.kind, status=proposed.status, updated_at=proposed.updated_at,
      request_id=proposed.request_id, source_route=proposed.source_route, source=proposed.source,
      customer_name=proposed.customer_name, customer_phone=proposed.customer_phone, customer_email=proposed.customer_email,
      service_type=proposed.service_type, service_name=proposed.service_name, total_price=proposed.total_price,
      total_price_cents=proposed.total_price_cents, selected_date=proposed.selected_date, selected_time=proposed.selected_time,
      full_address=proposed.full_address, http_status=proposed.http_status, code=proposed.code, retryable=proposed.retryable,
      warnings=proposed.warnings, error_message=proposed.error_message, contact_id=proposed.contact_id,
      note_created=proposed.note_created, opportunity_created=proposed.opportunity_created,
      custom_fields_updated=proposed.custom_fields_updated, used_existing_contact=proposed.used_existing_contact,
      retry_count=proposed.retry_count, last_retry_at=proposed.last_retry_at, last_retry_status=proposed.last_retry_status,
      last_retry_message=proposed.last_retry_message, retry_history=proposed.retry_history, payload_for_retry=proposed.payload_for_retry
      where id=proposed.id returning * into saved;
  else raise exception 'Invalid write mode'; end if;
  return to_jsonb(saved);
end;
$$;

create or replace function public.archive_quote_ops_entry(p_entry_id uuid, p_expected_updated_at timestamptz,
    p_require_no_order boolean, p_audit_context jsonb)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
declare prior public.quote_ops_entries;
begin
  perform set_config('shynli.audit_context', coalesce(p_audit_context, '{}')::text, true);
  select * into prior from public.quote_ops_entries where id=p_entry_id for update;
  if not found or p_expected_updated_at is null or prior.updated_at is distinct from p_expected_updated_at then return false; end if;
  if p_require_no_order and public.quote_ops_order_state(prior.payload_for_retry) <> '{}'::jsonb then
    raise exception 'Cannot delete a request containing an order' using errcode='23514';
  end if;
  -- The trigger copies the entire row into trash and writes history in THIS transaction.
  delete from public.quote_ops_entries where id=p_entry_id;
  return true;
end;
$$;

create or replace function public.restore_quote_ops_entry(p_trash_id uuid, p_audit_context jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  item public.quote_ops_trash;
  proposed public.quote_ops_entries;
  current_entry public.quote_ops_entries;
  restored jsonb;
begin
  select * into item from public.quote_ops_trash where id=p_trash_id for update;
  if not found or item.restored_at is not null then return null; end if;
  proposed := jsonb_populate_record(null::public.quote_ops_entries, item.row_data);
  proposed.updated_at := clock_timestamp();
  if item.scope = 'entry' then
    restored := public.save_quote_ops_entry(to_jsonb(proposed), 'insert', null,
      coalesce(p_audit_context,'{}') || '{"operation":"restore"}');
  else
    select * into current_entry from public.quote_ops_entries where id=item.entry_id for update;
    if not found or current_entry.updated_at is distinct from item.live_updated_at or
      public.quote_ops_order_state(current_entry.payload_for_retry) <> '{}'::jsonb then
      raise exception 'Restore conflicts with a newer record' using errcode='40001';
    end if;
    restored := public.save_quote_ops_entry(to_jsonb(proposed), 'update', current_entry.updated_at,
      coalesce(p_audit_context,'{}') || '{"operation":"restore"}');
  end if;
  -- The existing recurring-slot trigger also rejects restores that would duplicate a visit.
  if restored is null then raise exception 'Restore was not persisted'; end if;
  update public.quote_ops_trash set restored_at=clock_timestamp(), restored_by=p_audit_context->'actor' where id=item.id;
  return restored;
end;
$$;

revoke all on function public.audit_quote_ops_mutation() from public, anon, authenticated;
revoke all on function public.quote_ops_history_snapshot(jsonb) from public, anon, authenticated;
revoke all on function public.save_quote_ops_entry(jsonb,text,timestamptz,jsonb) from public, anon, authenticated;
revoke all on function public.archive_quote_ops_entry(uuid,timestamptz,boolean,jsonb) from public, anon, authenticated;
revoke all on function public.restore_quote_ops_entry(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.save_quote_ops_entry(jsonb,text,timestamptz,jsonb) to service_role;
grant execute on function public.archive_quote_ops_entry(uuid,timestamptz,boolean,jsonb) to service_role;
grant execute on function public.restore_quote_ops_entry(uuid,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
