-- Read-only summaries for background series checks. Full records remain the write source.
create or replace function public.read_recurring_assignment_context(
  p_entry_ids text[], p_after uuid default null, p_limit integer default 500
) returns jsonb
language plpgsql stable security invoker set search_path = public
as $$
begin
  if p_entry_ids is null or cardinality(p_entry_ids) not between 1 and 75
     or p_limit is null or p_limit not between 1 and 500
     or exists (select 1 from unnest(p_entry_ids) x where x is null or length(x) not between 1 and 120) then
    raise exception 'Invalid recurring assignment scope';
  end if;
  return (
    with candidates as materialized (
      select q.id, q.request_id, q.warnings, q.code, q.created_at, q.updated_at,
        jsonb_build_object('assignment', jsonb_build_object(
          'entryId', q.payload_for_retry #> '{assignment,entryId}',
          'staffIds', q.payload_for_retry #> '{assignment,staffIds}',
          'status', q.payload_for_retry #> '{assignment,status}',
          'createdAt', q.payload_for_retry #> '{assignment,createdAt}',
          'updatedAt', q.payload_for_retry #> '{assignment,updatedAt}'
        )) as payload_for_retry
      from public.quote_ops_entries q
      where q.kind = 'admin_staff_assignment' and (p_after is null or q.id > p_after)
        and (left(regexp_replace(q.request_id, '^\s+|\s+$', '', 'g'),120) = any(p_entry_ids)
          or left(regexp_replace(q.payload_for_retry #>> '{assignment,entryId}', '^\s+|\s+$', '', 'g'),120) = any(p_entry_ids)
          or jsonb_typeof(q.payload_for_retry #> '{assignment,entryId}') not in ('string','null'))
    ), page as (select * from candidates order by id limit p_limit)
    select jsonb_build_object('version',1,'after',p_after,'total',(select count(*) from candidates),
      'rows',coalesce((select jsonb_agg(to_jsonb(page) order by id) from page),'[]'::jsonb))
  );
end;
$$;
revoke all on function public.read_recurring_assignment_context(text[],uuid,integer) from public, anon, authenticated;
grant execute on function public.read_recurring_assignment_context(text[],uuid,integer) to service_role;
