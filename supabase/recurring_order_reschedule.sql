-- Install updated recurring_order_insert.sql first. This migration rewrites no existing data.
begin;
create or replace function public.reschedule_recurring_quote_orders(p_plan jsonb, p_audit_context jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  series text := p_plan->>'seriesId';
  change jsonb;
  member jsonb;
  prior public.quote_ops_entries;
  saved public.quote_ops_entries;
  payload jsonb;
  state jsonb;
  key text;
  changes jsonb := p_plan->'changes';
  members jsonb := p_plan->'members';
  result jsonb := '[]'::jsonb;
  stamp timestamptz := clock_timestamp();
  later boolean;
begin
  if coalesce(series, '') = '' or jsonb_typeof(changes) is distinct from 'array' or jsonb_array_length(changes) = 0
      or jsonb_typeof(members) is distinct from 'array' then raise exception 'Invalid recurring schedule plan'; end if;
  perform pg_advisory_xact_lock(hashtextextended('shynli:recurring-order:' || series, 0));
  perform 1 from public.quote_ops_entries q where public.quote_ops_recurring_series_id(q) = series order by q.id for update;
  if (select count(*) from public.quote_ops_entries q where public.quote_ops_recurring_series_id(q) = series
        and public.quote_ops_order_state(q.payload_for_retry) <> '{}'::jsonb) <> jsonb_array_length(members)
      or (select count(distinct item->>'id') from jsonb_array_elements(members) item) <> jsonb_array_length(members) then
    raise exception 'Recurring membership changed' using errcode = '40001';
  end if;
  for member in select * from jsonb_array_elements(members) loop
    select * into prior from public.quote_ops_entries where id = (member->>'id')::uuid;
    if not found or prior.updated_at is distinct from (member->>'updatedAt')::timestamptz
        or public.quote_ops_recurring_series_id(prior) <> series then
      raise exception 'Recurring order changed' using errcode = '40001';
    end if;
  end loop;
  if (select count(distinct item->>'id') from jsonb_array_elements(changes) item) <> jsonb_array_length(changes) then
    raise exception 'Duplicate schedule patch';
  end if;
  for change in select * from jsonb_array_elements(changes) loop
    select * into prior from public.quote_ops_entries where id = (change->>'id')::uuid;
    state := public.quote_ops_order_state(prior.payload_for_retry);
    if not found or public.quote_ops_recurring_series_id(prior) <> series
        or ((coalesce(state->>'status','') not in ('new','scheduled','rescheduled')
          or coalesce(state->>'paymentStatus','') in ('paid','partial','partially-paid')
          or coalesce(state->'payroll'->>'paidAt','') <> ''
          or exists (select 1 from jsonb_array_elements(coalesce(state->'payroll'->'items','[]')) item
            where item->>'status' = 'paid' or coalesce(item->>'paidAt','') <> ''))
          and not (coalesce((change->>'markerOnly')::boolean,false) and change->>'id' = p_plan->>'sourceId'
            and state->'recurringPendingScheduleMove' = 'true'::jsonb
            and change->>'date' = prior.selected_date and change->>'time' = prior.selected_time))
        or prior.payload_for_retry ? 'orderTrash'
        or coalesce(change->>'date','') !~ '^\d{4}-\d{2}-\d{2}$'
        or coalesce(change->>'time','') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
        or not exists (select 1 from jsonb_array_elements(members) m where m->>'id' = change->>'id') then
      raise exception 'Unsafe recurring schedule change' using errcode = '40001';
    end if;
    perform (change->>'date')::date;
    if change ? 'marker' and (change->>'id' <> p_plan->>'sourceId' or change->'marker'->>'date' <> change->>'date'
        or change->'marker'->>'time' <> change->>'time') then raise exception 'Invalid cadence marker'; end if;
  end loop;
  if not exists (select 1 from jsonb_array_elements(changes) c where c->>'id' = p_plan->>'sourceId' and c ? 'marker') then
    raise exception 'Missing recurring source marker';
  end if;
  -- Check the final layout before writing. Canceled visits remain untouched and never reappear.
  if exists (
    select 1 from public.quote_ops_entries q
    cross join lateral (select public.quote_ops_order_state(q.payload_for_retry) s) v
    left join lateral (select c from jsonb_array_elements(changes) c where c->>'id' = q.id::text) patch on true
    where public.quote_ops_recurring_series_id(q) = series and s <> '{}'::jsonb
      and (coalesce(s->>'status','') not in ('canceled','cancelled','rescheduled') or patch.c is not null)
    group by coalesce(patch.c->>'date', nullif(s->>'selectedDate',''), q.selected_date),
      coalesce(patch.c->>'time', nullif(s->>'selectedTime',''), q.selected_time)
    having count(*) > 1
  ) then raise exception 'Recurring schedule collision' using errcode = '23505'; end if;
  perform set_config('shynli.audit_context', (coalesce(p_audit_context,'{}') ||
    jsonb_build_object('operation','series-reschedule','scope','future','seriesId',series))::text, true);
  select c->>'date' >= q.selected_date into later from jsonb_array_elements(changes) c
    join public.quote_ops_entries q on q.id = (c->>'id')::uuid where c->>'id' = p_plan->>'sourceId';
  -- Vacate the farthest slots first when moving forward (nearest first when moving back).
  for change in select c from jsonb_array_elements(changes) c
      order by case when later then c->>'date' end desc, case when not later then c->>'date' end asc loop
    select * into prior from public.quote_ops_entries where id = (change->>'id')::uuid;
    payload := prior.payload_for_retry;
    foreach key in array array['orderState','adminOrder','calculatorData'] loop
      state := payload->key;
      if jsonb_typeof(state) = 'object' then
        state := state || jsonb_build_object('selectedDate',change->>'date','selectedTime',change->>'time');
        if key <> 'calculatorData' then
          state := state || jsonb_build_object('updatedAt',stamp);
          if change ? 'marker' then state := (state - 'recurringPendingScheduleMove' - 'recurringPendingResetFromDate') ||
            jsonb_build_object('recurringSchedule',change->'marker'); end if;
        end if;
        payload := jsonb_set(payload,array[key],state);
      end if;
    end loop;
    update public.quote_ops_entries set selected_date=change->>'date', selected_time=change->>'time',
      payload_for_retry=payload, updated_at=greatest(stamp,prior.updated_at + interval '1 microsecond')
      where id=prior.id returning * into saved;
    result := result || jsonb_build_array(to_jsonb(saved));
  end loop;
  return result;
end;
$$;
revoke all on function public.reschedule_recurring_quote_orders(jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.reschedule_recurring_quote_orders(jsonb,jsonb) to service_role;
commit;
