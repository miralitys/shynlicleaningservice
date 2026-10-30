-- Display-only Orders projection. No ledger, assignment or payroll rows are changed.
begin;

create or replace function public.admin_order_list_pick(p_value jsonb, p_keys text[])
returns jsonb language sql immutable parallel safe security invoker
set search_path = pg_catalog
as $$
  select case when jsonb_typeof(p_value) = 'object' then
    coalesce((select jsonb_object_agg(key, value)
      from jsonb_each(p_value) where key = any(p_keys)), '{}'::jsonb)
  else p_value end;
$$;

create or replace function public.admin_order_list_state(p_state jsonb)
returns jsonb language plpgsql immutable parallel safe security invoker
set search_path = pg_catalog
as $$
declare
  result jsonb;
  completion jsonb;
begin
  if jsonb_typeof(p_state) is distinct from 'object' then return p_state; end if;
  result := public.admin_order_list_pick(p_state, array[
    'isCreated', 'createdAt', 'status', 'assignedStaff', 'assignee', 'selectedDate', 'selectedTime',
    'frequency', 'paymentStatus', 'paymentMethod', 'serviceDurationMinutes', 'recurringNextEntryId',
    'recurringGeneratedAt', 'recurringSeriesId', 'recurringAnchorDate', 'recurringSourceEntryId',
    'cleanerConfirmation'
  ]);
  if jsonb_typeof(p_state->'policyAcceptance') = 'object' then
    result := jsonb_set(result, '{policyAcceptance}', public.admin_order_list_pick(
      p_state->'policyAcceptance', array['policyAccepted', 'sentAt', 'firstViewedAt', 'lastViewedAt', 'signedAt']));
  end if;
  completion := p_state->'completion';
  if jsonb_typeof(completion) = 'object' then
    -- Let the existing JS recognizer handle legacy comment types and whitespace.
    -- No checklist, photo metadata or full completion document crosses the wire.
    result := jsonb_set(result, '{completion}', public.admin_order_list_pick(completion, array['cleanerComment']));
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

create or replace view public.admin_order_list_entries
with (security_invoker = true, security_barrier = true) as
select id, kind, status, created_at, updated_at, request_id, source_route, source,
  customer_name, customer_phone, customer_email, service_type, service_name,
  total_price, total_price_cents, selected_date, selected_time, full_address,
  code, error_message, contact_id,
  jsonb_build_object(
    'orderState', public.admin_order_list_state(payload_for_retry->'orderState'),
    'adminOrder', public.admin_order_list_state(payload_for_retry->'adminOrder'),
    'paymentState', public.admin_order_list_pick(payload_for_retry->'paymentState', array['status', 'method']),
    'payment', public.admin_order_list_pick(payload_for_retry->'payment', array['status', 'method']),
    'calculatorData', payload_for_retry->'calculatorData',
    'adminLead', payload_for_retry->'adminLead',
    'leadAttribution', public.admin_order_list_pick(payload_for_retry->'leadAttribution', array['lead_source_channel', 'form_type', 'referrer', 'utm_source']),
    'adminClient', case when jsonb_typeof(payload_for_retry->'adminClient') = 'object'
      then (payload_for_retry->'adminClient') - 'photos' else payload_for_retry->'adminClient' end
  ) as payload_for_retry
from public.quote_ops_entries;

revoke all on public.admin_order_list_entries from public, anon, authenticated, service_role;
grant select on public.admin_order_list_entries to service_role;
revoke all on function public.admin_order_list_pick(jsonb, text[]) from public, anon, authenticated;
revoke all on function public.admin_order_list_state(jsonb) from public, anon, authenticated;
grant execute on function public.admin_order_list_pick(jsonb, text[]) to service_role;
grant execute on function public.admin_order_list_state(jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
