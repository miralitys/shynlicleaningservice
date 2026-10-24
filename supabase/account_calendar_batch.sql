-- Pending migration: a read-only scalar envelope avoids REST row caps and
-- per-chunk round trips. Build each slim state once; preserve the established
-- legacy/photo-only recognition without enumerating unrelated large JSON values.
begin;

create or replace function public.account_calendar_batch_state(p_state jsonb)
returns jsonb language plpgsql immutable parallel safe security invoker
set search_path = pg_catalog
as $$
declare
  result jsonb;
  completion jsonb;
begin
  if jsonb_typeof(p_state) is distinct from 'object' then return p_state; end if;
  select coalesce(jsonb_object_agg(key, p_state->key), '{}'::jsonb) into result
  from unnest(array['isCreated', 'createdAt', 'status', 'assignedStaff', 'assignee',
    'selectedDate', 'selectedTime', 'frequency', 'paymentMethod']) as fields(key)
  where p_state ? key;
  completion := p_state->'completion';
  if jsonb_typeof(completion) = 'object' then
    result := result || jsonb_build_object('completion', case when completion ? 'cleanerComment'
      then jsonb_build_object('cleanerComment', completion->'cleanerComment') else '{}'::jsonb end);
    if (case when jsonb_typeof(completion->'beforePhotos') = 'array'
        then jsonb_array_length(completion->'beforePhotos') > 0 else false end)
      or (case when jsonb_typeof(completion->'afterPhotos') = 'array'
        then jsonb_array_length(completion->'afterPhotos') > 0 else false end) then
      result := result || '{"isCreated":true}'::jsonb;
    end if;
  end if;
  if p_state <> '{}'::jsonb and result = '{}'::jsonb then
    result := '{"listHasOrderState":true}'::jsonb;
  end if;
  return result;
end;
$$;

create or replace function public.read_account_calendar_entries(p_entry_ids uuid[])
returns jsonb language sql stable security invoker
set search_path = pg_catalog
as $$
  with wanted as materialized (
    select distinct id from unnest(p_entry_ids) as ids(id) where id is not null
  ), matched as materialized (
    select id, selected_date, jsonb_build_object(
      'orderState', public.account_calendar_batch_state(payload_for_retry->'orderState'),
      'adminOrder', public.account_calendar_batch_state(payload_for_retry->'adminOrder'),
      'calculatorData', public.account_order_list_pick(payload_for_retry->'calculatorData', array['selectedDate'])
    ) as payload_for_retry
    from public.quote_ops_entries
    where id = any(p_entry_ids)
  )
  select jsonb_build_object(
    'version', 1,
    'requested_count', (select count(*) from wanted),
    'matched_count', (select count(*) from matched),
    'missing_ids', coalesce((select jsonb_agg(w.id order by w.id) from wanted w
      where not exists (select 1 from matched m where m.id = w.id)), '[]'::jsonb),
    'rows', coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from matched m), '[]'::jsonb)
  );
$$;

revoke all on function public.read_account_calendar_entries(uuid[]) from public, anon, authenticated;
grant execute on function public.read_account_calendar_entries(uuid[]) to service_role;
revoke all on function public.account_calendar_batch_state(jsonb) from public, anon, authenticated;
grant execute on function public.account_calendar_batch_state(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
