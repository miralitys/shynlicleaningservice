-- Read-only calendar projection. Install separately before enabling the lean path.
-- No orders, assignments, financial values or existing views are changed.
begin;

create or replace function public.account_calendar_state(p_state jsonb)
returns jsonb language sql immutable parallel safe security invoker
set search_path = pg_catalog
as $$
  with projected as (select case when jsonb_typeof(p_state) = 'object' then
    public.account_order_list_pick(p_state, array[
      'isCreated', 'createdAt', 'status', 'assignedStaff', 'assignee', 'selectedDate', 'selectedTime',
      'frequency', 'paymentMethod', 'listHasOrderState'
    ]) || case when jsonb_typeof(p_state->'completion') = 'object' then
      jsonb_build_object('completion', public.account_order_list_pick(p_state->'completion', array['cleanerComment']))
    else '{}'::jsonb end
  else p_state end as value)
  select case when jsonb_typeof(p_state) = 'object' and p_state <> '{}'::jsonb and value = '{}'::jsonb
    then '{"listHasOrderState":true}'::jsonb else value end from projected;
$$;

-- The existing list projection already preserves completion-photo-only order
-- recognition without exposing photo metadata. Keep empty/null roots distinct.
create or replace view public.account_calendar_entries
with (security_invoker = true, security_barrier = true) as
select id, selected_date, jsonb_build_object(
  'orderState', public.account_calendar_state(payload_for_retry->'orderState'),
  'adminOrder', public.account_calendar_state(payload_for_retry->'adminOrder'),
  'calculatorData', public.account_order_list_pick(payload_for_retry->'calculatorData', array['selectedDate'])
) as payload_for_retry
from public.account_order_list_entries;

revoke all on public.account_calendar_entries from public, anon, authenticated, service_role;
grant select on public.account_calendar_entries to service_role;
revoke all on function public.account_calendar_state(jsonb) from public, anon, authenticated;
grant execute on function public.account_calendar_state(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
