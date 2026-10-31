-- Orders table only. Requires admin_order_list.sql. Existing views and records stay unchanged.
begin;

create or replace view public.admin_order_table_entries
with (security_invoker = true, security_barrier = true) as
select id, kind, status, created_at, updated_at, request_id, source_route, source,
  customer_name, customer_phone, customer_email, service_type, service_name,
  total_price, total_price_cents, selected_date, selected_time, full_address,
  code, error_message, contact_id,
  public.admin_order_list_state(payload_for_retry->'orderState') as "list_orderState",
  public.admin_order_list_state(payload_for_retry->'adminOrder') as "list_adminOrder",
  public.admin_order_list_pick(payload_for_retry->'paymentState', array['status', 'method']) as "list_paymentState",
  public.admin_order_list_pick(payload_for_retry->'payment', array['status', 'method']) as list_payment,
  public.admin_order_list_pick(payload_for_retry->'calculatorData',
    array['selectedDate', 'selectedTime', 'serviceType', 'serviceDurationMinutes', 'frequency']) as "list_calculatorData",
  public.admin_order_list_pick(payload_for_retry->'adminLead',
    array['status', 'tasks', 'updatedAt', 'managerId', 'managerName', 'managerEmail']) as "list_adminLead",
  public.admin_order_list_pick(payload_for_retry->'leadAttribution',
    array['lead_source_channel', 'form_type', 'referrer', 'utm_source']) as "list_leadAttribution"
from public.quote_ops_entries;

revoke all on public.admin_order_table_entries from public, anon, authenticated, service_role;
grant select on public.admin_order_table_entries to service_role;

notify pgrst, 'reload schema';
commit;
