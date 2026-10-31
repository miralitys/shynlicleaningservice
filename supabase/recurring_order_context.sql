-- Additive, SELECT-only series context. Full order reads and write guards stay unchanged.
begin;

create or replace function public.recurring_order_context_state(value jsonb)
returns jsonb language sql immutable parallel safe security invoker
set search_path = pg_catalog
as $$
  select case when jsonb_typeof(value) = 'object' then
    case when projected = '{}'::jsonb and value <> '{}'::jsonb
      then '{"recurringContextHasOrderState":true}'::jsonb else projected end
    else 'null'::jsonb end
  from (select coalesce(jsonb_object_agg(key, item), '{}'::jsonb) as projected
    from jsonb_each(case when jsonb_typeof(value) = 'object' then value else '{}'::jsonb end) as e(key, item)
    where key = any(array[
      'isCreated', 'status', 'frequency', 'selectedDate', 'selectedTime', 'serviceType',
      'managerConfirmationRequired', 'managerConfirmedAt', 'recurringSeriesId', 'recurringAnchorDate',
      'recurringOccurrenceDate', 'recurringOccurrenceIndex', 'recurringSourceEntryId', 'recurringSourceRequestId',
      'recurringNextEntryId', 'recurringGeneratedAt', 'recurringSeriesCanceledFromDate',
      'recurringPendingResetFromDate', 'recurringSchedule'
    ])) p;
$$;

create or replace function public.read_recurring_order_context(
  p_after uuid default null, p_limit integer default 500,
  p_series_id text default null, p_known_entry_ids uuid[] default '{}'::uuid[]
)
returns jsonb language plpgsql stable parallel safe security invoker
set search_path = pg_catalog
as $$
declare result jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Recurring context limit must be between 1 and 500' using errcode = '22023';
  end if;
  if p_known_entry_ids is null or cardinality(p_known_entry_ids) > 75 or
    array_position(p_known_entry_ids, null) is not null or
    (p_series_id is null and cardinality(p_known_entry_ids) > 0) or
    (p_series_id is not null and (length(p_series_id) > 90 or p_series_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$')) then
    raise exception 'Invalid recurring context identity' using errcode = '22023';
  end if;

  -- Count IDs only. Project JSON after selecting the bounded raw page, never before LIMIT.
  with matching as materialized (
    select q.id from public.quote_ops_entries q
    where (p_after is null or q.id > p_after) and (p_series_id is null or
      q.id = any(p_known_entry_ids) or
      q.payload_for_retry->'orderState'->>'recurringSeriesId' = p_series_id or
      q.payload_for_retry->'adminOrder'->>'recurringSeriesId' = p_series_id or
      q.request_id = p_series_id or q.request_id like p_series_id || '-next-%')
  ), page as materialized (
    select q.* from public.quote_ops_entries q
    join (select id from matching order by id limit p_limit) m using (id)
  ), projected as (
    select id, kind, created_at, updated_at, request_id, source_route, service_type, selected_date, selected_time,
      jsonb_build_object(
        'orderState', public.recurring_order_context_state(payload_for_retry->'orderState'),
        'adminOrder', public.recurring_order_context_state(payload_for_retry->'adminOrder')
      ) as payload_for_retry from page
  )
  select jsonb_build_object('version', 1, 'after', p_after, 'total', (select count(*) from matching),
    'rows', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from projected p), '[]'::jsonb)) into result;
  return result;
end;
$$;

revoke all on function public.recurring_order_context_state(jsonb) from public, anon, authenticated;
revoke all on function public.read_recurring_order_context(uuid, integer, text, uuid[]) from public, anon, authenticated;
grant execute on function public.recurring_order_context_state(jsonb) to service_role;
grant execute on function public.read_recurring_order_context(uuid, integer, text, uuid[]) to service_role;
notify pgrst, 'reload schema';
commit;
