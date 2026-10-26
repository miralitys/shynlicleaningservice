-- Additive, read-only workspace paging. Keep admin_workspace_list_entries for rollback.
-- Requires admin_workspace_list.sql and admin_order_list.sql.
begin;

create or replace function public.read_admin_workspace_page(p_after uuid default null, p_limit integer default 500)
returns jsonb language plpgsql stable parallel safe security invoker
set search_path = pg_catalog
as $$
declare
  remaining bigint;
  result_rows jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 500 then
    raise exception 'Workspace page limit must be between 1 and 500' using errcode = '22023';
  end if;

  select count(*) into remaining from public.quote_ops_entries q
  where p_after is null or q.id > p_after;

  -- Bound the raw page before evaluating any expensive JSON projection.
  with raw_page as materialized (
    select q.id, q.kind, q.status, q.created_at, q.updated_at, q.request_id, q.source_route, q.source,
      q.customer_name, q.customer_phone, q.customer_email, q.service_type, q.service_name,
      q.total_price, q.total_price_cents, q.selected_date, q.selected_time, q.full_address,
      q.code, q.error_message, q.contact_id, q.retry_count, q.payload_for_retry
    from public.quote_ops_entries q
    where p_after is null or q.id > p_after
    order by q.id limit p_limit
  ), projected as materialized (
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
      ) as payload
    from raw_page
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb) into result_rows
  from (
    select id, kind, status, created_at, updated_at, request_id, source_route, source,
      customer_name, customer_phone, customer_email, service_type, service_name,
      total_price, total_price_cents, selected_date, selected_time, full_address,
      code, error_message, contact_id, retry_count,
      payload->'orderState' as "workspace_orderState",
      payload->'adminOrder' as "workspace_adminOrder",
      payload->'adminLead' as "workspace_adminLead",
      payload->'calculatorData' as "workspace_calculatorData",
      payload->'adminClient' as "workspace_adminClient"
    from projected
  ) r;
  return jsonb_build_object('version', 1, 'after', p_after, 'total', remaining, 'rows', result_rows);
end;
$$;

revoke all on function public.read_admin_workspace_page(uuid, integer) from public, anon, authenticated;
grant execute on function public.read_admin_workspace_page(uuid, integer) to service_role;
notify pgrst, 'reload schema';
commit;

