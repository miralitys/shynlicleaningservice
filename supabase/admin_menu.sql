-- Requires admin_order_list.sql. Read-only menu input, never a mutation source.
begin;
create or replace view public.admin_menu_entries
with (security_invoker = true, security_barrier = true) as
select id, kind, status, created_at, updated_at, code,
  jsonb_build_object(
    'orderState', public.admin_order_list_state(payload_for_retry->'orderState'),
    'adminOrder', public.admin_order_list_state(payload_for_retry->'adminOrder'),
    'adminLead', case when jsonb_typeof(payload_for_retry->'adminLead') = 'object' then
      jsonb_build_object('status', payload_for_retry->'adminLead'->'status',
        'tasks', case when jsonb_typeof(payload_for_retry->'adminLead'->'tasks') = 'array' then
          (select coalesce(jsonb_agg(case when jsonb_typeof(task) = 'object'
              then public.admin_order_list_pick(task, array['id', 'status']) else task end order by position), '[]'::jsonb)
            from jsonb_array_elements(payload_for_retry->'adminLead'->'tasks') with ordinality as t(task, position))
          else payload_for_retry->'adminLead'->'tasks' end)
      else payload_for_retry->'adminLead' end
  ) as payload_for_retry
from public.quote_ops_entries;
revoke all on public.admin_menu_entries from public, anon, authenticated, service_role;
grant select on public.admin_menu_entries to service_role;
notify pgrst, 'reload schema';
commit;
