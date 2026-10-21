create table if not exists public.admin_audit_events (
  id uuid primary key,
  occurred_at timestamptz not null default now(),
  completed_at timestamptz,
  request_id text not null,
  actor jsonb not null,
  entity_type text not null check (entity_type in ('client', 'order')),
  entity_id text not null,
  entity_label text not null default '',
  entry_id text,
  action text not null check (action in ('create', 'update', 'delete', 'restore')),
  status text not null check (status in ('pending', 'succeeded', 'failed', 'unconfirmed', 'noop')),
  route text not null default '',
  before_data jsonb,
  after_data jsonb,
  changes jsonb not null default '[]'::jsonb
);

-- No foreign key: deleting a customer or order must never delete its history.
create index if not exists admin_audit_events_time on public.admin_audit_events (occurred_at desc, id desc);
create index if not exists admin_audit_events_entity on public.admin_audit_events (entity_type, entity_id, occurred_at desc);
create index if not exists admin_audit_events_actor on public.admin_audit_events ((actor->>'email'), occurred_at desc);
alter table public.admin_audit_events enable row level security;
revoke all on public.admin_audit_events from anon, authenticated;
grant select, insert, update on public.admin_audit_events to service_role;
revoke delete on public.admin_audit_events from service_role;
