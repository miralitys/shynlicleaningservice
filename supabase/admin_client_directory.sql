-- Move the existing display-only projection before the network boundary.
-- No filtering, limits, client grouping or source records are changed.
begin;

create or replace function public.admin_client_directory_state(p_state jsonb)
returns jsonb language plpgsql immutable parallel safe security invoker
set search_path = pg_catalog
as $$
declare
  result jsonb;
  completion jsonb;
  preview jsonb;
begin
  if jsonb_typeof(p_state) is distinct from 'object' then return p_state; end if;
  result := p_state - 'completion' - 'policyAcceptance' - 'payroll';
  completion := p_state->'completion';
  if jsonb_typeof(completion) = 'object' then
    -- JS keeps its exact legacy String/trim handling; photo contents never leave SQL.
    preview := case when completion ? 'cleanerComment'
      then jsonb_build_object('cleanerComment', completion->'cleanerComment') else '{}'::jsonb end;
    if jsonb_typeof(completion->'beforePhotos') = 'array' then
      if jsonb_array_length(completion->'beforePhotos') > 0 then
        preview := preview || '{"beforePhotos":[null]}'::jsonb;
      end if;
    end if;
    if jsonb_typeof(completion->'afterPhotos') = 'array' then
      if jsonb_array_length(completion->'afterPhotos') > 0 then
        preview := preview || '{"afterPhotos":[null]}'::jsonb;
      end if;
    end if;
    result := result || jsonb_build_object('completion', preview);
  end if;
  if p_state <> '{}'::jsonb and result = '{}'::jsonb then
    result := '{"directoryHasOrderState":true}'::jsonb;
  end if;
  return result;
end;
$$;

create or replace view public.admin_client_directory_entries
with (security_invoker = true, security_barrier = true) as
select id, kind, status, created_at, updated_at, request_id, source_route, source,
  customer_name, customer_phone, customer_email, service_type, service_name,
  total_price, total_price_cents, selected_date, selected_time, full_address,
  code, error_message, contact_id,
  public.admin_client_directory_state(payload_for_retry->'orderState') as "directory_orderState",
  public.admin_client_directory_state(payload_for_retry->'adminOrder') as "directory_adminOrder",
  payload_for_retry->'adminLead' as "directory_adminLead",
  payload_for_retry->'calculatorData' as "directory_calculatorData",
  case when jsonb_typeof(payload_for_retry->'adminClient') = 'object'
    then (payload_for_retry->'adminClient') - 'photos' else payload_for_retry->'adminClient' end as "directory_adminClient"
from public.quote_ops_entries;

revoke all on public.admin_client_directory_entries from public, anon, authenticated, service_role;
grant select on public.admin_client_directory_entries to service_role;
revoke all on function public.admin_client_directory_state(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.admin_client_directory_state(jsonb) to service_role;

notify pgrst, 'reload schema';
commit;
