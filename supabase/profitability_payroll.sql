begin;

-- Payout, financial fields and private audit must commit together. No visit,
-- customer price, assignment, payment status or recurring fields are writable.
create or replace function public.save_profitability_with_payroll(
  p_record_id text, p_patch jsonb, p_expected_version integer, p_actor jsonb,
  p_expected_updated_at timestamptz, p_overrides jsonb, p_payroll jsonb, p_before_payouts jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  current_entry public.quote_ops_entries;
  payload jsonb;
  order_state jsonb;
  old_record public.profitability_records;
  saved public.profitability_records;
  item jsonb;
  order_updated_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('profitability:' || p_record_id, 0));
  if p_expected_version is null or p_expected_version < 0 or jsonb_typeof(p_patch) is distinct from 'object' then raise exception 'Invalid finance patch'; end if;
  select * into current_entry from public.quote_ops_entries where id::text = p_record_id for update;
  if not found or current_entry.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '23505', message = 'Order changed; reload before editing payroll';
  end if;
  if jsonb_typeof(p_overrides) is distinct from 'object' or jsonb_typeof(p_patch->'payouts') is distinct from 'array' then
    raise exception 'Invalid payroll patch';
  end if;
  payload := coalesce(current_entry.payload_for_retry, '{}'::jsonb);
  order_state := coalesce(payload->'orderState', payload->'adminOrder', '{}'::jsonb);
  -- A second check at the transaction boundary protects settled payroll even
  -- if a caller sends a stale or malformed computed snapshot.
  for item in select value from jsonb_array_elements(coalesce(order_state->'payroll'->'items', '[]'::jsonb)) loop
    if item->>'status' = 'paid' and (p_payroll is null or not coalesce(p_payroll->'items', '[]'::jsonb) @> jsonb_build_array(item)) then
      raise exception using errcode = '23505', message = 'Paid payroll cannot be changed';
    end if;
  end loop;
  order_state := order_state || jsonb_build_object('payrollOverrides', p_overrides);
  if p_payroll is not null then order_state := order_state || jsonb_build_object('payroll', p_payroll); end if;
  payload := payload || jsonb_build_object('orderState', order_state, 'adminOrder', order_state);
  select * into old_record from public.profitability_records where id = p_record_id for update;
  if coalesce(old_record.version, 0) <> p_expected_version then raise exception using errcode = '23505', message = 'Finance changed; reload'; end if;
  insert into public.profitability_records(id, version, data, updated_at)
    values(p_record_id, p_expected_version + 1, coalesce(old_record.data, '{}'::jsonb) || p_patch, clock_timestamp())
    on conflict(id) do update set version = excluded.version, data = excluded.data, updated_at = excluded.updated_at
    returning * into saved;
  insert into public.profitability_events(record_id, actor, before_data, after_data)
    values(p_record_id, p_actor, coalesce(old_record.data, '{}'::jsonb) || jsonb_build_object('payouts', p_before_payouts), saved.data);
  update public.quote_ops_entries set payload_for_retry = payload, updated_at = clock_timestamp() where id = current_entry.id returning updated_at into order_updated_at;
  return to_jsonb(saved) || jsonb_build_object('orderUpdatedAt', order_updated_at);
end;
$$;

revoke all on function public.save_profitability_with_payroll(text,jsonb,integer,jsonb,timestamptz,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.save_profitability_with_payroll(text,jsonb,integer,jsonb,timestamptz,jsonb,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
