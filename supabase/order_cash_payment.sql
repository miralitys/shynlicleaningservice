begin;

-- Record a full Cash receipt and both journals in one transaction. This RPC
-- accepts no client-provided price, assignment, visit date or payout fields.
create or replace function public.mark_order_paid_cash(
  p_record_id text, p_expected_updated_at timestamptz, p_expected_version integer,
  p_actor jsonb, p_paid_at date, p_audit_context jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  entry public.quote_ops_entries;
  old_finance public.profitability_records;
  saved public.profitability_records;
  state jsonb;
  payload jsonb;
  before_payment jsonb;
  after_payment jsonb;
  changes jsonb;
  amount bigint;
  stamp timestamptz;
begin
  perform pg_advisory_xact_lock(hashtextextended('profitability:' || p_record_id, 0));
  select * into entry from public.quote_ops_entries where id::text = p_record_id for update;
  if not found or p_expected_updated_at is null or entry.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '23505', message = 'Order changed; reload';
  end if;
  payload := coalesce(entry.payload_for_retry, '{}'::jsonb);
  state := public.quote_ops_order_state(payload);
  if state = '{}'::jsonb or payload ? 'orderTrash' or state->>'status' in ('completed', 'canceled') then
    raise exception 'An existing open order is required';
  end if;
  if p_expected_version is null or p_expected_version < 0 or p_paid_at is null or coalesce(p_actor->>'id','') = '' then raise exception 'Invalid receipt context'; end if;
  select * into old_finance from public.profitability_records where id = p_record_id for update;
  if coalesce(old_finance.version, 0) <> p_expected_version then
    raise exception using errcode = '23505', message = 'Finance changed; reload';
  end if;
  amount := coalesce((old_finance.data->>'basePriceCents')::bigint, round(coalesce(entry.total_price,0) * 100)::bigint)
    + coalesce((old_finance.data->>'addonsCents')::bigint,0) - coalesce((old_finance.data->>'discountCents')::bigint,0);
  if amount < 0 or amount > 999999999 then raise exception 'Invalid amount due'; end if;
  if coalesce((old_finance.data->>'paidCents')::bigint,0) > amount then
    raise exception using errcode = '23505', message = 'An overpayment requires a manager';
  end if;
  if state->>'paymentStatus' = 'paid' and state->>'paymentMethod' = 'cash'
      and (old_finance.data->>'paidCents')::bigint = amount and old_finance.data->>'paymentMethod' = 'cash' then
    return to_jsonb(old_finance) || jsonb_build_object('orderUpdatedAt', entry.updated_at);
  end if;
  before_payment := jsonb_build_object('paymentStatus',state->'paymentStatus', 'paymentMethod',state->'paymentMethod',
    'paymentReceivedCents',state->'paymentReceivedCents');
  state := state || jsonb_build_object('paymentStatus','paid','paymentMethod','cash','paymentReceivedCents',amount,'paymentReceivedAt',p_paid_at);
  payload := payload || jsonb_build_object('orderState',state,'adminOrder',state);
  insert into public.profitability_records(id,version,data,updated_at)
    values(p_record_id,p_expected_version+1,coalesce(old_finance.data,'{}'::jsonb) ||
      jsonb_build_object('paidCents',amount,'paymentMethod','cash','paidAt',p_paid_at),clock_timestamp())
    on conflict(id) do update set version=excluded.version,data=excluded.data,updated_at=excluded.updated_at returning * into saved;
  insert into public.profitability_events(record_id,actor,before_data,after_data)
    values(p_record_id,p_actor,coalesce(old_finance.data,'{}'::jsonb),saved.data);
  perform set_config('shynli.audit_context', (coalesce(p_audit_context,'{}'::jsonb) || jsonb_build_object('actor',p_actor))::text,true);
  update public.quote_ops_entries set payload_for_retry=payload,updated_at=clock_timestamp() where id=entry.id returning updated_at into stamp;
  after_payment := jsonb_build_object('paymentStatus','paid','paymentMethod','cash','paymentReceivedCents',amount);
  select coalesce(jsonb_agg(jsonb_build_object('field',key,'old',before_payment->key,'new',value)), '[]'::jsonb)
    into changes from jsonb_each(after_payment) where value is distinct from before_payment->key;
  insert into public.admin_audit_events(id,completed_at,request_id,actor,entity_type,entity_id,entity_label,entry_id,action,status,route,before_data,after_data,changes)
    values(gen_random_uuid(),clock_timestamp(),coalesce(p_audit_context->>'requestId',''),p_actor,'order',p_record_id,
      coalesce(entry.customer_name,''),p_record_id,'update','succeeded','/admin/orders',before_payment,after_payment,changes);
  return to_jsonb(saved) || jsonb_build_object('orderUpdatedAt',stamp);
end;
$$;

revoke all on function public.mark_order_paid_cash(text,timestamptz,integer,jsonb,date,jsonb) from public,anon,authenticated;
grant execute on function public.mark_order_paid_cash(text,timestamptz,integer,jsonb,date,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
