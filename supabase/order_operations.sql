begin;

-- One transaction protects the visit, assignment, settled payroll and journal.
create or replace function public.update_order_operations(
  p_record_id text, p_expected_updated_at timestamptz, p_expected_assignment_updated_at timestamptz,
  p_order_state jsonb, p_assignment jsonb, p_actor jsonb, p_audit_context jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  entry public.quote_ops_entries;
  assignment jsonb;
  assignment_row public.quote_ops_entries;
  assignment_record jsonb;
  assignment_stamp timestamptz;
  assignment_staff_ids jsonb;
  assignment_id uuid;
  hash_bytes bytea;
  dedicated_staff boolean;
  stamp timestamptz;
  old_state jsonb;
  payload jsonb;
  paid_item jsonb;
  next_item jsonb;
  fields text[] := array['status','assignedStaff','payroll','managerConfirmedAt','updatedAt'];
  changes jsonb;
begin
  select * into entry from public.quote_ops_entries where id::text=p_record_id for update;
  if not found or p_expected_updated_at is null or entry.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='23505', message='Order changed; reload';
  end if;
  payload := coalesce(entry.payload_for_retry,'{}'::jsonb);
  old_state := public.quote_ops_order_state(payload);
  if old_state='{}'::jsonb or payload ? 'orderTrash' or old_state->>'status' in ('completed','canceled') then
    raise exception 'An existing open visit is required';
  end if;
  if coalesce(p_actor->>'id','')='' or jsonb_typeof(p_order_state) is distinct from 'object'
      or (p_order_state-fields) is distinct from (old_state-fields) then raise exception 'Invalid operational fields'; end if;
  if p_order_state->>'status' is distinct from old_state->>'status'
      and p_order_state->>'status' not in ('scheduled','en-route','cleaning-started','checklist','photos','cleaning-complete','awaiting-review','completed') then
    raise exception 'Invalid work stage';
  end if;
  dedicated_staff := to_regclass('public.admin_staff') is not null and to_regclass('public.admin_staff_assignments') is not null;
  if dedicated_staff then
    select to_jsonb(a) into assignment from public.admin_staff_assignments a where entry_id=entry.id for update;
    assignment_stamp := (assignment->>'updated_at')::timestamptz;
    assignment_staff_ids := assignment->'staff_ids';
  else
    -- Match buildQuoteOpsAssignmentRowId without adding a second staff store.
    hash_bytes := substring(sha256(convert_to('admin-staff-assignment:'||p_record_id,'UTF8')) from 1 for 16);
    hash_bytes := set_byte(hash_bytes,6,(get_byte(hash_bytes,6)&15)|80);
    hash_bytes := set_byte(hash_bytes,8,(get_byte(hash_bytes,8)&63)|128);
    assignment_id := encode(hash_bytes,'hex')::uuid;
    select * into assignment_row from public.quote_ops_entries where id=assignment_id for update;
    if assignment_row.id is not null and (assignment_row.kind<>'admin_staff_assignment' or assignment_row.request_id is distinct from p_record_id) then
      raise exception 'Assignment identity mismatch';
    end if;
    assignment_record := coalesce(assignment_row.payload_for_retry->'assignment','{}'::jsonb);
    assignment_stamp := coalesce(nullif(assignment_record->>'updatedAt','')::timestamptz,assignment_row.updated_at);
    assignment_staff_ids := coalesce(assignment_record->'staffIds',assignment_row.warnings);
  end if;
  if assignment_stamp is distinct from p_expected_assignment_updated_at then
    raise exception using errcode='23505', message='Assignment changed; reload';
  end if;
  if (p_assignment is null or p_assignment->'staffIds'=assignment_staff_ids) and (p_order_state->'payroll') is distinct from (old_state->'payroll') then
    raise exception 'Status changes cannot alter payroll';
  end if;
  for paid_item in select value from jsonb_array_elements(coalesce(old_state->'payroll'->'items','[]'::jsonb)) where value->>'status'='paid' loop
    select value into next_item from jsonb_array_elements(coalesce(p_order_state->'payroll'->'items','[]'::jsonb)) where value->>'staffId'=paid_item->>'staffId';
    if next_item is null or next_item->>'status'<>'paid' or next_item->'amountCents' is distinct from paid_item->'amountCents'
        or next_item->'paidAt' is distinct from paid_item->'paidAt' or next_item->'paidByName' is distinct from paid_item->'paidByName'
        or next_item->'paidByEmail' is distinct from paid_item->'paidByEmail' then raise exception 'Settled payroll must be preserved'; end if;
  end loop;
  perform set_config('shynli.audit_context',(coalesce(p_audit_context,'{}'::jsonb)||jsonb_build_object('actor',p_actor))::text,true);
  if p_assignment is not null then
    if jsonb_typeof(p_assignment->'staffIds') is distinct from 'array' or jsonb_array_length(p_assignment->'staffIds') not between 1 and 6 then
      raise exception 'Invalid team';
    end if;
    if dedicated_staff then
      if exists(select 1 from jsonb_array_elements_text(p_assignment->'staffIds') ids(id)
          left join public.admin_staff staff on staff.id::text=ids.id where staff.id is null or staff.status='inactive') then raise exception 'Inactive team member'; end if;
      if assignment is null then
        insert into public.admin_staff_assignments(entry_id,staff_ids,status)
          values(entry.id,p_assignment->'staffIds',p_assignment->>'status');
      else
        update public.admin_staff_assignments set staff_ids=p_assignment->'staffIds',status=p_assignment->>'status',updated_at=clock_timestamp() where entry_id=entry.id;
      end if;
    else
      if exists(select 1 from jsonb_array_elements_text(p_assignment->'staffIds') ids(id) where not exists(
        select 1 from public.quote_ops_entries s where s.kind='admin_staff_member'
          and coalesce(nullif(s.payload_for_retry#>>'{staff,id}',''),s.id::text)=ids.id
          and coalesce(nullif(s.payload_for_retry#>>'{staff,status}',''),s.code,'active')<>'inactive')) then raise exception 'Inactive team member'; end if;
      stamp := clock_timestamp();
      if assignment_row.id is null then
        assignment_record := coalesce(p_assignment,'{}'::jsonb)||jsonb_build_object('entryId',p_record_id,'createdAt',stamp,'updatedAt',stamp);
        insert into public.quote_ops_entries(id,kind,status,request_id,source_route,source,code,warnings,selected_date,selected_time,error_message,payload_for_retry,created_at,updated_at)
          values(assignment_id,'admin_staff_assignment','success',p_record_id,'/admin/staff','admin-staff',p_assignment->>'status',p_assignment->'staffIds',
            coalesce(p_assignment->>'scheduleDate',''),coalesce(p_assignment->>'scheduleTime',''),coalesce(p_assignment->>'notes',''),
            jsonb_build_object('type','admin_staff_assignment','assignment',assignment_record),stamp,stamp);
      else
        assignment_record := assignment_record||jsonb_build_object('staffIds',p_assignment->'staffIds','status',p_assignment->>'status','updatedAt',stamp);
        update public.quote_ops_entries set warnings=p_assignment->'staffIds',code=p_assignment->>'status',updated_at=stamp,
          payload_for_retry=coalesce(assignment_row.payload_for_retry,'{}'::jsonb)||jsonb_build_object('assignment',assignment_record) where id=assignment_id;
      end if;
    end if;
  end if;
  update public.quote_ops_entries set payload_for_retry=payload||jsonb_build_object('orderState',p_order_state,'adminOrder',p_order_state),
    updated_at=clock_timestamp() where id=entry.id;
  select coalesce(jsonb_agg(jsonb_build_object('field',key,'old',old_state->key,'new',value)),'[]'::jsonb) into changes
    from jsonb_each(p_order_state) where key=any(fields) and key<>'updatedAt' and value is distinct from old_state->key;
  insert into public.admin_audit_events(id,completed_at,request_id,actor,entity_type,entity_id,entity_label,entry_id,action,status,route,before_data,after_data,changes)
    values(gen_random_uuid(),clock_timestamp(),coalesce(p_audit_context->>'requestId',''),p_actor,'order',p_record_id,
      coalesce(entry.customer_name,''),p_record_id,'update','succeeded','/admin/orders',old_state,p_order_state,changes);
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.update_order_operations(text,timestamptz,timestamptz,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.update_order_operations(text,timestamptz,timestamptz,jsonb,jsonb,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
