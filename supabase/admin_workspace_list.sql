-- Read-only task/archive input. Requires admin_order_list.sql; never changes ledger rows.
begin;

create or replace function public.admin_workspace_state(p_state jsonb)
returns jsonb language plpgsql immutable parallel safe security invoker
set search_path = pg_catalog
as $$
declare result jsonb; completion jsonb;
begin
  if jsonb_typeof(p_state) is distinct from 'object' then return p_state; end if;
  result := public.admin_order_list_pick(p_state, array[
    'isCreated', 'createdAt', 'status', 'assignedStaff', 'assignee', 'selectedDate', 'selectedTime',
    'frequency', 'paymentMethod', 'managerConfirmationRequired', 'managerConfirmedAt',
    'recurringSeriesId', 'recurringSourceEntryId'
  ]);
  completion := p_state->'completion';
  if jsonb_typeof(completion) = 'object' then
    result := jsonb_set(result, '{completion}', public.admin_order_list_pick(completion, array['cleanerComment']));
    if (case when jsonb_typeof(completion->'beforePhotos') = 'array'
        then jsonb_array_length(completion->'beforePhotos') > 0 else false end)
      or (case when jsonb_typeof(completion->'afterPhotos') = 'array'
        then jsonb_array_length(completion->'afterPhotos') > 0 else false end) then
      result := result || '{"isCreated":true}'::jsonb;
    end if;
  end if;
  if p_state <> '{}'::jsonb and result = '{}'::jsonb then result := '{"workspaceHasOrderState":true}'::jsonb; end if;
  return result;
end;
$$;

create or replace function public.admin_workspace_lead(p_lead jsonb)
returns jsonb language sql immutable parallel safe security invoker
set search_path = pg_catalog
as $$
  select case when jsonb_typeof(p_lead) = 'object' then
    public.admin_order_list_pick(p_lead, array['status', 'updatedAt', 'managerId', 'managerName', 'managerEmail', 'notes']) ||
    case when p_lead ? 'tasks' then jsonb_build_object('tasks', case when jsonb_typeof(p_lead->'tasks') = 'array' then
      (select coalesce(jsonb_agg(public.admin_order_list_pick(task, array[
        'id', 'kind', 'title', 'stage', 'dueAt', 'status', 'createdAt', 'updatedAt', 'completedAt',
        'resolution', 'comment', 'attempt', 'assigneeId', 'assigneeName', 'assigneeEmail', 'assigneeRole'
      ]) order by position), '[]'::jsonb)
      from jsonb_array_elements(p_lead->'tasks') with ordinality as t(task, position))
      else p_lead->'tasks' end) else '{}'::jsonb end
    else p_lead end;
$$;

create or replace view public.admin_workspace_list_entries
with (security_invoker = true, security_barrier = true) as
select id, kind, status, created_at, updated_at, request_id, source_route, source,
  customer_name, customer_phone, customer_email, service_type, service_name,
  total_price, total_price_cents, selected_date, selected_time, full_address,
  code, error_message, contact_id, retry_count,
  jsonb_build_object(
    'orderState', public.admin_workspace_state(payload_for_retry->'orderState'),
    'adminOrder', public.admin_workspace_state(payload_for_retry->'adminOrder'),
    'adminLead', public.admin_workspace_lead(payload_for_retry->'adminLead'),
    'calculatorData', public.admin_order_list_pick(payload_for_retry->'calculatorData', array['additionalDetails', 'fullAddress', 'address']),
    'adminClient', case when jsonb_typeof(payload_for_retry->'adminClient') = 'object' then
      case when payload_for_retry->'adminClient' ? 'addressBook' then
        jsonb_build_object('addressBook', case when jsonb_typeof(payload_for_retry->'adminClient'->'addressBook') = 'array' then
          (select coalesce(jsonb_agg(public.admin_order_list_pick(address, array['address', 'value', 'notes', 'specialInstructions'])
            order by position), '[]'::jsonb)
            from jsonb_array_elements(payload_for_retry->'adminClient'->'addressBook') with ordinality as a(address, position))
          else payload_for_retry->'adminClient'->'addressBook' end)
        else '{}'::jsonb end
      else payload_for_retry->'adminClient' end
  ) as payload_for_retry
from public.quote_ops_entries;

revoke all on public.admin_workspace_list_entries from public, anon, authenticated, service_role;
grant select on public.admin_workspace_list_entries to service_role;
revoke all on function public.admin_workspace_state(jsonb), public.admin_workspace_lead(jsonb) from public, anon, authenticated;
grant execute on function public.admin_workspace_state(jsonb), public.admin_workspace_lead(jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
