-- Apply before deploying the guarded recurring generator. Does not modify existing orders.
begin;
create or replace function public.quote_ops_order_state(p_payload jsonb)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select case when jsonb_typeof(p_payload->'orderState') = 'object' then p_payload->'orderState'
    when jsonb_typeof(p_payload->'adminOrder') = 'object' then p_payload->'adminOrder'
    else '{}'::jsonb end;
$$;

create or replace function public.quote_ops_recurring_source_state(p_row public.quote_ops_entries)
returns jsonb language sql immutable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'seriesId', btrim(coalesce(s->>'recurringSeriesId', '')),
    'anchorDate', btrim(coalesce(s->>'recurringAnchorDate', '')),
    'occurrenceDate', btrim(coalesce(s->>'recurringOccurrenceDate', '')),
    'frequency', lower(btrim(coalesce(s->>'frequency', ''))),
    'status', lower(btrim(coalesce(s->>'status', ''))),
    'canceledFromDate', btrim(coalesce(s->>'recurringSeriesCanceledFromDate', '')),
    'selectedDate', btrim(coalesce(nullif(s->>'selectedDate', ''), p_row.selected_date, '')),
    'selectedTime', btrim(coalesce(nullif(s->>'selectedTime', ''), p_row.selected_time, ''))
  ) from (select public.quote_ops_order_state(p_row.payload_for_retry) as s) v;
$$;

create or replace function public.quote_ops_recurring_series_id(p_row public.quote_ops_entries)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case when jsonb_typeof(s) = 'object' and s <> '{}'::jsonb then
    coalesce(nullif(btrim(s->>'recurringSeriesId'), ''), regexp_replace(coalesce(
      nullif(btrim(s->>'recurringSourceRequestId'), ''), nullif(btrim(p_row.request_id), ''), p_row.id::text),
      '(-next-[0-9]{8})+$', '')) end
  from (select public.quote_ops_order_state(p_row.payload_for_retry) s) v;
$$;

create or replace function public.guard_recurring_quote_slot()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  old_series text;
  new_series text;
  old_state jsonb;
  new_state jsonb;
  lock_id text;
  prior public.quote_ops_entries;
begin
  if tg_op <> 'INSERT' then
    old_series := public.quote_ops_recurring_series_id(old);
    old_state := public.quote_ops_recurring_source_state(old);
  end if;
  if tg_op <> 'DELETE' then
    new_series := public.quote_ops_recurring_series_id(new);
    new_state := public.quote_ops_recurring_source_state(new);
  end if;
  if tg_op = 'INSERT' then
    -- PostgREST upserts run BEFORE INSERT before resolving the existing primary key.
    select * into prior from public.quote_ops_entries where id = new.id;
    if found then
      old_series := public.quote_ops_recurring_series_id(prior);
      old_state := public.quote_ops_recurring_source_state(prior);
    end if;
  end if;
  if old_series is null and new_series is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op = 'UPDATE' and old_series is not distinct from new_series and old_state = new_state then return new; end if;
  for lock_id in select distinct v from unnest(array[old_series, new_series]) v where v is not null order by v loop
    perform pg_advisory_xact_lock(hashtextextended('shynli:recurring-order:' || lock_id, 0));
  end loop;
  if tg_op = 'INSERT' and old_state is not null then
    select * into prior from public.quote_ops_entries where id = new.id;
    if found then
      if public.quote_ops_recurring_series_id(prior) is distinct from old_series then
        raise exception 'Recurring order changed concurrently' using errcode = '40001';
      end if;
      old_state := public.quote_ops_recurring_source_state(prior);
    else old_state := null;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if new_series is null or new_state->>'status' in ('canceled', 'cancelled', 'rescheduled') then return new; end if;
  -- Existing duplicates can still be paid/completed; only new or moved/restored slots are checked.
  if (tg_op = 'UPDATE' or (tg_op = 'INSERT' and old_state is not null)) and old_series = new_series and
    old_state->>'selectedDate' = new_state->>'selectedDate' and
    old_state->>'selectedTime' = new_state->>'selectedTime' and
    coalesce(old_state->>'status', '') not in ('canceled', 'cancelled', 'rescheduled') then return new; end if;
  if exists (select 1 from public.quote_ops_entries q where q.id <> new.id and
    public.quote_ops_recurring_series_id(q) = new_series and
    public.quote_ops_recurring_source_state(q)->>'selectedDate' = new_state->>'selectedDate' and
    public.quote_ops_recurring_source_state(q)->>'selectedTime' = new_state->>'selectedTime' and
    coalesce(public.quote_ops_recurring_source_state(q)->>'status', '') not in ('canceled', 'cancelled', 'rescheduled')) then
    raise exception 'Recurring slot already occupied' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists quote_ops_recurring_slot_guard on public.quote_ops_entries;
create trigger quote_ops_recurring_slot_guard before insert or update or delete on public.quote_ops_entries
  for each row execute function public.guard_recurring_quote_slot();

create or replace function public.insert_recurring_quote_order(p_entry jsonb, p_source_guard jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  proposed public.quote_ops_entries;
  source_entry public.quote_ops_entries;
  existing public.quote_ops_entries;
  order_data jsonb;
  source_order jsonb;
  series_id text;
  occurrence_date text;
  matches integer;
begin
  proposed := jsonb_populate_record(null::public.quote_ops_entries, p_entry);
  order_data := public.quote_ops_order_state(proposed.payload_for_retry);
  series_id := order_data->>'recurringSeriesId';
  occurrence_date := order_data->>'recurringOccurrenceDate';
  if proposed.code is distinct from 'RECURRING_ORDER_CREATED' or
    coalesce(series_id, '') = '' or coalesce(occurrence_date, '') = '' or
    coalesce(p_source_guard->>'entryId', '') = '' or p_source_guard->'state' is null then
    raise exception 'Invalid recurring occurrence or source guard';
  end if;

  -- Serialize all writers of the same raw series identity, including other app instances.
  perform pg_advisory_xact_lock(hashtextextended('shynli:recurring-order:' || series_id, 0));
  select * into source_entry from public.quote_ops_entries
    where id = (p_source_guard->>'entryId')::uuid;
  source_order := public.quote_ops_order_state(source_entry.payload_for_retry);
  if not found or jsonb_typeof(source_order) is distinct from 'object' or source_order = '{}'::jsonb or
    public.quote_ops_recurring_source_state(source_entry) is distinct from p_source_guard->'state' or
    coalesce(source_order->>'status', '') in ('canceled', 'cancelled', 'rescheduled') then
    raise exception 'Recurring source changed or no longer exists' using errcode = '40001';
  end if;

  if exists (select 1 from public.quote_ops_entries q where
    public.quote_ops_recurring_series_id(q) = series_id and
    coalesce(public.quote_ops_recurring_source_state(q)->>'canceledFromDate', '') <> '' and
    occurrence_date >= public.quote_ops_recurring_source_state(q)->>'canceledFromDate') then
    return jsonb_build_object('entry', null, 'inserted', false, 'skipped', true);
  end if;

  -- Legacy UUIDs and deleted shells also reserve their original occurrence/request.
  select count(*) into matches from public.quote_ops_entries q
    cross join lateral (select public.quote_ops_order_state(q.payload_for_retry) s) v
    where (s->>'recurringSeriesId' = series_id and s->>'recurringOccurrenceDate' = occurrence_date) or
      (q.request_id = proposed.request_id and coalesce(s->>'recurringSeriesId', '') in ('', series_id) and
        coalesce(s->>'recurringOccurrenceDate', '') in ('', occurrence_date));
  if matches > 1 then
    -- One real order plus deleted shells is safe; multiple real orders require a separate review.
    select count(*) into matches from public.quote_ops_entries q
      cross join lateral (select public.quote_ops_order_state(q.payload_for_retry) s) v
      where s <> '{}'::jsonb and ((s->>'recurringSeriesId' = series_id and s->>'recurringOccurrenceDate' = occurrence_date) or
        (q.request_id = proposed.request_id and coalesce(s->>'recurringSeriesId', '') in ('', series_id) and
          coalesce(s->>'recurringOccurrenceDate', '') in ('', occurrence_date)));
    if matches > 1 then raise exception 'Multiple existing orders match this recurring occurrence'; end if;
  end if;
  select q.* into existing from public.quote_ops_entries q
    cross join lateral (select public.quote_ops_order_state(q.payload_for_retry) s) v
    where (s->>'recurringSeriesId' = series_id and s->>'recurringOccurrenceDate' = occurrence_date) or
      (q.request_id = proposed.request_id and coalesce(s->>'recurringSeriesId', '') in ('', series_id) and
        coalesce(s->>'recurringOccurrenceDate', '') in ('', occurrence_date))
    order by (s <> '{}'::jsonb) desc, q.updated_at desc, q.id desc limit 1;
  if found then
    if existing.id = source_entry.id then
      return jsonb_build_object('entry', null, 'inserted', false, 'skipped', true);
    end if;
    return jsonb_build_object('entry', to_jsonb(existing), 'inserted', false);
  end if;

  -- A moved occurrence may already occupy this actual slot under another canonical date.
  if exists (select 1 from public.quote_ops_entries q
    cross join lateral (select public.quote_ops_order_state(q.payload_for_retry) s) v
    where s->>'recurringSeriesId' = series_id and
      coalesce(s->>'status', '') not in ('canceled', 'cancelled', 'rescheduled') and
      coalesce(nullif(s->>'selectedDate', ''), q.selected_date, '') = proposed.selected_date and
      coalesce(nullif(s->>'selectedTime', ''), q.selected_time, '') = proposed.selected_time) then
    return jsonb_build_object('entry', null, 'inserted', false, 'skipped', true);
  end if;

  insert into public.quote_ops_entries select (proposed).* on conflict (id) do nothing returning * into existing;
  if found then return jsonb_build_object('entry', to_jsonb(existing), 'inserted', true); end if;
  select * into existing from public.quote_ops_entries where id = proposed.id;
  if not found then raise exception 'Recurring occurrence was not persisted'; end if;
  return jsonb_build_object('entry', to_jsonb(existing), 'inserted', false);
end;
$$;

revoke all on function public.quote_ops_order_state(jsonb) from public, anon, authenticated;
revoke all on function public.quote_ops_recurring_source_state(public.quote_ops_entries) from public, anon, authenticated;
revoke all on function public.quote_ops_recurring_series_id(public.quote_ops_entries) from public, anon, authenticated;
revoke all on function public.guard_recurring_quote_slot() from public, anon, authenticated;
revoke all on function public.insert_recurring_quote_order(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.insert_recurring_quote_order(jsonb, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
