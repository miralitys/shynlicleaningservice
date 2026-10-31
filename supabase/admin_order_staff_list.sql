-- Preserve JavaScript's fallback semantics without transferring duplicate raw fields.
create or replace function public.admin_order_staff_list_value(value jsonb, fallback jsonb)
returns jsonb language sql immutable security invoker set search_path = pg_catalog
as $$ select case when value is null or value in ('null'::jsonb,'false'::jsonb,'0'::jsonb,'""'::jsonb)
  then fallback else value end $$;

create or replace view public.admin_order_staff_list_entries with (security_invoker=true) as
with records as (
select q.id,q.kind,case when q.kind='admin_staff_member' then jsonb_build_object(
  'id',public.admin_order_staff_list_value(q.payload_for_retry#>'{staff,id}',to_jsonb(q.id)),
  'name',public.admin_order_staff_list_value(q.payload_for_retry#>'{staff,name}',to_jsonb(q.customer_name)),
  'role',public.admin_order_staff_list_value(q.payload_for_retry#>'{staff,role}',to_jsonb(q.service_name)),
  'address',public.admin_order_staff_list_value(q.payload_for_retry#>'{staff,address}',to_jsonb(q.full_address)),
  'status',public.admin_order_staff_list_value(q.payload_for_retry#>'{staff,status}',to_jsonb(q.code)),
  'createdAt',public.admin_order_staff_list_value(q.payload_for_retry#>'{staff,createdAt}',to_jsonb(q.created_at)),
  'updatedAt',public.admin_order_staff_list_value(q.payload_for_retry#>'{staff,updatedAt}',to_jsonb(q.updated_at))
) else jsonb_build_object(
  'entryId',public.admin_order_staff_list_value(q.payload_for_retry#>'{assignment,entryId}',to_jsonb(q.request_id)),
  'staffIds',public.admin_order_staff_list_value(q.payload_for_retry#>'{assignment,staffIds}',q.warnings),
  'scheduleDate',public.admin_order_staff_list_value(q.payload_for_retry#>'{assignment,scheduleDate}',to_jsonb(q.selected_date)),
  'scheduleTime',public.admin_order_staff_list_value(q.payload_for_retry#>'{assignment,scheduleTime}',to_jsonb(q.selected_time)),
  'status',public.admin_order_staff_list_value(q.payload_for_retry#>'{assignment,status}',to_jsonb(q.code)),
  'notes',public.admin_order_staff_list_value(q.payload_for_retry#>'{assignment,notes}',to_jsonb(q.error_message)),
  'travelEstimates',q.payload_for_retry#>'{assignment,travelEstimates}',
  'createdAt',public.admin_order_staff_list_value(q.payload_for_retry#>'{assignment,createdAt}',to_jsonb(q.created_at)),
  'updatedAt',public.admin_order_staff_list_value(q.payload_for_retry#>'{assignment,updatedAt}',to_jsonb(q.updated_at))
) end as list_record
from public.quote_ops_entries q where q.kind in ('admin_staff_member','admin_staff_assignment')
)
select id,kind,list_record,
  case when kind='admin_staff_assignment' then list_record || jsonb_build_object(
    -- Keep raw staff IDs so the existing JS sanitizer decides whether a legacy
    -- travel-only assignment exists, without transferring addresses or routes.
    'travelEstimates',case when jsonb_typeof(list_record->'travelEstimates')='array' then
      (select coalesce(jsonb_agg(jsonb_build_object('staffId',item->'staffId') order by position),'[]'::jsonb)
        from jsonb_array_elements(list_record->'travelEstimates') with ordinality as travel(item,position))
      else list_record->'travelEstimates' end
  ) else list_record end as planning_record
from records;

revoke all on function public.admin_order_staff_list_value(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.admin_order_staff_list_value(jsonb,jsonb) to service_role;
revoke all on public.admin_order_staff_list_entries from public,anon,authenticated;
grant select on public.admin_order_staff_list_entries to service_role;
